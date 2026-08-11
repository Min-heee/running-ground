import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRaceDdayLabel,
  formatRaceStartLabel,
  RACE_REMINDER_BEFORE_START_MS,
  resolveRaceJoinAction,
  resolveRaceReminderAtMs,
} from '@/features/race/raceHubModel';

// 8·15런: 2026-08-15(토) 20:15 KST. 테스트는 파서가 기기 로컬 시간대로 해석하는 로컬 ISO를 쓴다
// (라벨 함수는 기기 로컬 기준 — 한국 유저 = KST — 이라는 계약 자체를 고정).
const START_LOCAL_ISO = '2026-08-15T20:15:00';

function localMs(iso: string): number {
  return new Date(iso).getTime();
}

test('formatRaceStartLabel: 월/일/(요일)/시:분 — 815런 형태 그대로', () => {
  assert.equal(formatRaceStartLabel(START_LOCAL_ISO), '8월 15일 (토) 20:15');
  assert.equal(formatRaceStartLabel('2026-01-05T09:05:00'), '1월 5일 (월) 09:05');
  assert.equal(formatRaceStartLabel(null), '일정 미정');
  assert.equal(formatRaceStartLabel('garbage'), '일정 미정');
});

test('buildRaceDdayLabel: 달력일 기준, 당일 D-DAY, 지나면 숨김', () => {
  assert.equal(buildRaceDdayLabel(START_LOCAL_ISO, localMs('2026-08-11T09:00:00')), 'D-4');
  // 같은 달력일이면 시각과 무관하게 D-DAY (출발 직전 23시에도).
  assert.equal(buildRaceDdayLabel(START_LOCAL_ISO, localMs('2026-08-15T07:00:00')), 'D-DAY');
  assert.equal(buildRaceDdayLabel(START_LOCAL_ISO, localMs('2026-08-16T00:10:00')), null);
  assert.equal(buildRaceDdayLabel('garbage', localMs('2026-08-11T09:00:00')), null);
});

test('resolveRaceJoinAction: 상태 → 버튼의 단일 진실', () => {
  const base = { status: 'registration_open' as const, registered: false, participantCount: 3, capacity: 0 };

  assert.deepEqual(resolveRaceJoinAction(base), { kind: 'join', label: '참가 신청', disabled: false });
  assert.deepEqual(
    resolveRaceJoinAction({ ...base, registered: true }),
    { kind: 'cancel', label: '신청 취소', disabled: false },
  );
  // 마감 임박에도 신청/취소는 열려 있다.
  assert.equal(resolveRaceJoinAction({ ...base, status: 'registration_closing' }).kind, 'join');
  assert.equal(resolveRaceJoinAction({ ...base, status: 'registration_closing', registered: true }).kind, 'cancel');
  // 마감 후: 미신청자는 못 들어오고, 신청자는 취소 불가(편성이 돌기 때문).
  assert.deepEqual(
    resolveRaceJoinAction({ ...base, status: 'registration_closed' }),
    { kind: 'closed', label: '신청 마감', disabled: true },
  );
  assert.deepEqual(
    resolveRaceJoinAction({ ...base, status: 'registration_closed', registered: true }),
    { kind: 'closed', label: '신청 완료 — 곧 시작해요', disabled: true },
  );
  // 정원: capacity 0은 무제한, 찼으면 잠금.
  assert.equal(resolveRaceJoinAction({ ...base, capacity: 3, participantCount: 3 }).kind, 'full');
  assert.equal(resolveRaceJoinAction({ ...base, capacity: 4, participantCount: 3 }).kind, 'join');
  // 진행/종료는 항상 잠금.
  assert.equal(resolveRaceJoinAction({ ...base, status: 'live' }).disabled, true);
  assert.equal(resolveRaceJoinAction({ ...base, status: 'finished' }).disabled, true);
});

test('resolveRaceReminderAtMs: 시작 10분 전, 이미 임박했으면 예약하지 않음', () => {
  const startMs = localMs(START_LOCAL_ISO);

  assert.equal(
    resolveRaceReminderAtMs(START_LOCAL_ISO, localMs('2026-08-11T09:00:00')),
    startMs - RACE_REMINDER_BEFORE_START_MS,
  );
  // 출발 9분 전 신청 — 과거 트리거를 예약하면 즉시 발화하므로 null이어야 한다.
  assert.equal(resolveRaceReminderAtMs(START_LOCAL_ISO, startMs - 9 * 60 * 1000), null);
  assert.equal(resolveRaceReminderAtMs('garbage', localMs('2026-08-11T09:00:00')), null);
});
