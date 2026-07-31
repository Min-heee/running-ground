// 홈 랭크 카드 1대1 전적 줄의 계약: 1대1만 센다, pending은 안 센다, 승률은 승패만으로.

import assert from 'node:assert/strict';
import test from 'node:test';

import type { MyRunRecord } from '@/domain';
import { buildDuelRecordSummary, formatDuelRecordLine } from './duelRecordSummary';

function duelRun(resultTone?: 'win' | 'lose' | 'draw'): MyRunRecord {
  return {
    id: `run-${Math.random()}`,
    date: '2026-08-01',
    distanceKm: 5,
    pace: '05:30/km',
    matchResult: {
      mode: 'duel',
      title: '대결',
      summary: '요약',
      badgeLabel: '배지',
      ...(resultTone ? { resultTone } : {}),
    },
  } as MyRunRecord;
}

function groupRun(rank: number): MyRunRecord {
  return {
    id: `group-${rank}`,
    date: '2026-08-01',
    distanceKm: 5,
    pace: '05:30/km',
    matchResult: { mode: 'group', title: '그룹', summary: '요약', badgeLabel: '배지', rank },
  } as MyRunRecord;
}

test('1대1 승/패/무만 세고 그룹·솔로·pending은 무시한다', () => {
  const summary = buildDuelRecordSummary([
    duelRun('win'),
    duelRun('win'),
    duelRun('lose'),
    duelRun('draw'),
    duelRun(),
    groupRun(1),
    { id: 'solo', date: '2026-08-01', distanceKm: 3, pace: '06:00/km' } as MyRunRecord,
  ]);

  assert.deepEqual(summary, { wins: 2, losses: 1, draws: 1, winRatePercent: 67 });
});

test('승률은 승패만으로 반올림하고, 승패가 없으면 0', () => {
  assert.equal(buildDuelRecordSummary([duelRun('win'), duelRun('lose'), duelRun('lose')]).winRatePercent, 33);
  assert.equal(buildDuelRecordSummary([duelRun('draw')]).winRatePercent, 0);
  assert.equal(buildDuelRecordSummary([]).winRatePercent, 0);
  assert.equal(buildDuelRecordSummary(null).winRatePercent, 0);
});

test('전적 줄: 무승부는 있을 때만 붙고, 전적이 비어도 0으로 보여준다', () => {
  assert.equal(
    formatDuelRecordLine({ wins: 12, losses: 8, draws: 0, winRatePercent: 60 }),
    '1대1 12승 8패',
  );
  assert.equal(
    formatDuelRecordLine({ wins: 2, losses: 1, draws: 1, winRatePercent: 67 }),
    '1대1 2승 1패 1무',
  );
  assert.equal(
    formatDuelRecordLine({ wins: 0, losses: 0, draws: 0, winRatePercent: 0 }),
    '1대1 0승 0패',
  );
});
