import assert from 'node:assert/strict';
import test from 'node:test';

import type { RunmadangChallenge } from '@/lib/api/types/runmadang';
import {
  buildRunmadangEndDateOptions,
  buildRunmadangResultLine,
  buildRunmadangStartDateOptions,
  clampRunmadangEndDate,
  formatKstDayLabel,
  formatRunmadangPeriod,
  formatRunmadangRemaining,
  formatRunmadangValue,
  splitRunmadangSections,
} from './runmadangModel';

function buildChallenge(overrides: Partial<RunmadangChallenge> = {}): RunmadangChallenge {
  return {
    id: 'runmadang-1',
    metric: 'distance',
    stakePoints: 100,
    startAt: '2026-08-06T15:00:00.000Z',
    endAt: '2026-08-13T15:00:00.000Z',
    status: 'running',
    hostUserId: 'user-a',
    hostName: '가람',
    participantCount: 2,
    potPoints: 200,
    myRole: 'participant',
    canJoin: false,
    canCancel: false,
    standings: [
      { userId: 'user-a', name: '가람', rank: 1, value: 12.5, runCount: 3, isMe: false },
      { userId: 'user-b', name: '나래', rank: 2, value: 8.2, runCount: 2, isMe: true },
    ],
    winnerUserIds: null,
    resultTone: null,
    settledAt: null,
    createdAt: '2026-08-06T03:00:00.000Z',
    ...overrides,
  };
}

test('기간 표시: KST 달력일, 종료 배타 경계는 하루 당겨 표시', () => {
  // 8/7 00:00 KST ~ 8/14 00:00 KST(배타) → 8.7 ~ 8.13.
  assert.equal(
    formatRunmadangPeriod('2026-08-06T15:00:00.000Z', '2026-08-13T15:00:00.000Z'),
    '8.7 (금) ~ 8.13 (목)',
  );
});

test('남은 시간: 일/시간/분 단위로 줄어들고 지나면 종료', () => {
  const endAt = '2026-08-13T15:00:00.000Z';
  assert.equal(formatRunmadangRemaining(endAt, Date.parse('2026-08-10T15:00:00.000Z')), '3일 남음');
  assert.equal(formatRunmadangRemaining(endAt, Date.parse('2026-08-13T10:00:00.000Z')), '5시간 남음');
  assert.equal(formatRunmadangRemaining(endAt, Date.parse('2026-08-13T14:59:00.000Z')), '1분 남음');
  assert.equal(formatRunmadangRemaining(endAt, Date.parse('2026-08-14T00:00:00.000Z')), '종료');
});

test('값 표시: 거리는 km 소수 2자리, 시간은 시·분 조합', () => {
  assert.equal(formatRunmadangValue('distance', 5.386), '5.39km');
  assert.equal(formatRunmadangValue('distance', 0), '0.00km');
  assert.equal(formatRunmadangValue('duration', 5040), '1시간 24분');
  assert.equal(formatRunmadangValue('duration', 2700), '45분');
  assert.equal(formatRunmadangValue('duration', 30), '30초');
});

test('직접 지정 날짜 후보: 시작은 내일부터 30일, 종료는 시작일부터 31일', () => {
  const nowMs = Date.parse('2026-08-06T03:00:00.000Z'); // KST 8/6 12:00
  const startOptions = buildRunmadangStartDateOptions(nowMs);
  assert.equal(startOptions.length, 30);
  assert.equal(startOptions[0].key, '2026-08-07');
  assert.equal(startOptions[0].label, '8.7 (금)');

  const endOptions = buildRunmadangEndDateOptions('2026-08-07');
  assert.equal(endOptions.length, 731); // 최대 2년 (오너 2026-08-07)
  assert.equal(endOptions[0].key, '2026-08-07');
  assert.equal(endOptions[30].key, '2026-09-06');
  assert.equal(endOptions[730].key, '2028-08-06');
});

test('목록 3분할: 초대/진행/끝난 판', () => {
  const sections = splitRunmadangSections([
    buildChallenge({ id: 'c1', myRole: 'invited', status: 'running', canJoin: true }),
    buildChallenge({ id: 'c2', myRole: 'host', status: 'upcoming' }),
    buildChallenge({ id: 'c3', myRole: 'participant', status: 'settled' }),
    buildChallenge({ id: 'c4', myRole: 'invited', status: 'settled' }), // 참가 안 한 지난 판은 숨김
    buildChallenge({ id: 'c5', myRole: 'declined', status: 'running' }),
  ]);

  assert.deepEqual(sections.invited.map((entry) => entry.id), ['c1']);
  assert.deepEqual(sections.active.map((entry) => entry.id), ['c2']);
  assert.deepEqual(sections.closed.map((entry) => entry.id), ['c3']);
});

test('결과 줄: 우승/패배/무효/취소', () => {
  assert.equal(
    buildRunmadangResultLine(buildChallenge({
      status: 'settled', resultTone: 'win', winnerUserIds: ['user-b'],
    })),
    '내가 우승! +200P',
  );
  assert.equal(
    buildRunmadangResultLine(buildChallenge({
      status: 'settled', resultTone: 'win', winnerUserIds: ['user-a'],
    })),
    '가람 우승 · 200P',
  );
  assert.equal(
    buildRunmadangResultLine(buildChallenge({ status: 'settled', resultTone: 'void' })),
    '무효 · 판돈 환불',
  );
  assert.equal(buildRunmadangResultLine(buildChallenge({ status: 'cancelled' })), '취소됨 · 판돈 환불');
  assert.equal(buildRunmadangResultLine(buildChallenge({ status: 'running' })), null);
});

// --- 적대 리뷰 수정 회귀 (2026-08-06) ---

test('연도 표시: 올해가 아니면 연도가 붙는다 (먼 미래 판 오인 방지)', () => {
  const nowMs = Date.parse('2026-08-06T03:00:00.000Z');
  assert.equal(formatKstDayLabel(Date.parse('2026-08-07T00:00:00+09:00'), nowMs), '8.7 (금)');
  assert.equal(formatKstDayLabel(Date.parse('2099-08-07T00:00:00+09:00'), nowMs), '2099.8.7 (금)');
  assert.equal(
    formatRunmadangPeriod('2099-08-06T15:00:00.000Z', '2099-08-13T15:00:00.000Z', nowMs),
    '2099.8.7 (금) ~ 2099.8.13 (목)',
  );
});

test('종료일 클램프: 시작일 재선택 시 창 밖 종료일은 null, 이르면 시작일로', () => {
  assert.equal(clampRunmadangEndDate('2026-08-07', null), null);
  assert.equal(clampRunmadangEndDate('2026-08-07', '2026-08-05'), '2026-08-07');
  assert.equal(clampRunmadangEndDate('2026-08-07', '2026-08-20'), '2026-08-20');
  assert.equal(clampRunmadangEndDate('2026-08-07', '2028-08-06'), '2028-08-06'); // 2년째 = 창 안
  assert.equal(clampRunmadangEndDate('2026-08-07', '2028-09-01'), null); // 창 밖
});

test('동률 결과 줄: 실수령액(myPayoutPoints)과 공동 우승 표기', () => {
  assert.equal(
    buildRunmadangResultLine(buildChallenge({
      status: 'settled',
      resultTone: 'win',
      winnerUserIds: ['user-a', 'user-b'],
      potPoints: 15,
      myPayoutPoints: 7,
    })),
    '공동 우승! +7P',
  );
  assert.equal(
    buildRunmadangResultLine(buildChallenge({
      status: 'settled',
      resultTone: 'win',
      winnerUserIds: ['user-a', 'user-c'],
      potPoints: 15,
      myPayoutPoints: 0,
      standings: [
        { userId: 'user-a', name: '가람', rank: 1, value: 5, runCount: 1, isMe: false },
        { userId: 'user-b', name: '나래', rank: 3, value: 1, runCount: 1, isMe: true },
        { userId: 'user-c', name: '다온', rank: 1, value: 5, runCount: 1, isMe: false },
      ],
    })),
    '가람, 다온 공동 우승 · 각 7P',
  );
});
