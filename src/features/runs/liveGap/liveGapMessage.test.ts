import assert from 'node:assert/strict';
import test from 'node:test';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildLiveGapOutput,
  buildPaceDiffLabel,
  buildPaceDiffSpeech,
  parseMeasuredPaceSecondsPerKm,
  resolveGroupGapTargets,
} from './liveGapMessage';

function standing(partial: Partial<GroupLiveStanding>): GroupLiveStanding {
  return {
    id: 'p',
    name: '러너',
    seedRank: 1,
    averagePace: '05:30/km',
    liveStatus: 'running',
    rank: 1,
    currentDistanceKm: 0,
    gapAheadKm: null,
    gapLeaderKm: 0,
    isForfeited: false,
    isCurrentUser: false,
    ...partial,
  } as unknown as GroupLiveStanding;
}

const GROUP_STANDINGS = [
  standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2, averagePace: '05:00/km' }),
  standing({ id: 'b', name: '영희', rank: 2, currentDistanceKm: 3.0, averagePace: '05:20/km' }),
  standing({ id: 'me', name: '나', rank: 3, currentDistanceKm: 2.8, averagePace: '05:30/km', isCurrentUser: true }),
];

test('parseMeasuredPaceSecondsPerKm returns null for placeholder paces', () => {
  assert.equal(parseMeasuredPaceSecondsPerKm('05:30/km'), 330);
  assert.equal(parseMeasuredPaceSecondsPerKm('5:30/km'), 330);
  assert.equal(parseMeasuredPaceSecondsPerKm('--:--/km'), null);
  assert.equal(parseMeasuredPaceSecondsPerKm('00:00/km'), null);
  assert.equal(parseMeasuredPaceSecondsPerKm(''), null);
  assert.equal(parseMeasuredPaceSecondsPerKm(null), null);
});

test('buildPaceDiffLabel describes my pace relative to the other runner', () => {
  // diff > 0 (opponent slower per km) → I am faster than them.
  assert.equal(buildPaceDiffLabel('05:30/km', '05:45/km'), '나보다 15초/km 느림');
  // diff < 0 (opponent faster per km) → I am slower than them.
  assert.equal(buildPaceDiffLabel('05:45/km', '05:30/km'), '나보다 15초/km 빠름');
  assert.equal(buildPaceDiffLabel('05:30/km', '05:30/km'), '페이스 비슷');
  assert.equal(buildPaceDiffLabel('05:30/km', '--:--/km'), null);
  assert.equal(buildPaceDiffLabel(null, '05:30/km'), null);
});

test('buildPaceDiffLabel suppresses implausible comparisons', () => {
  // The real-world garbage: a background-stale opponent reports e.g. 16:48/km against my
  // 05:30/km. That diff (678s) is impossible for two runners in the same race → omit it.
  assert.equal(buildPaceDiffLabel('05:30/km', '16:48/km'), null);
  // An absurd opponent pace beyond the slow bound (15:00/km) is rejected outright.
  assert.equal(buildPaceDiffLabel('05:30/km', '15:30/km'), null);
  // An impossibly fast opponent pace (faster than 2:30/km) is also rejected.
  assert.equal(buildPaceDiffLabel('05:30/km', '02:00/km'), null);
  // A plausible-but-large diff exactly at the cap still renders; just over it is dropped.
  assert.equal(buildPaceDiffLabel('05:00/km', '07:30/km'), '나보다 150초/km 느림');
  assert.equal(buildPaceDiffLabel('05:00/km', '07:31/km'), null);
  // The sane production cases (53s, 78s) must still render.
  assert.equal(buildPaceDiffLabel('05:00/km', '05:53/km'), '나보다 53초/km 느림');
  assert.equal(buildPaceDiffLabel('06:18/km', '05:00/km'), '나보다 78초/km 빠름');
});

test('buildPaceDiffSpeech phrases the pace gap for TTS', () => {
  // diff > 0 (opponent slower per km) → I am faster than them.
  assert.equal(buildPaceDiffSpeech('05:30/km', '05:45/km'), '페이스는 저보다 15초 느려요');
  // diff < 0 (opponent faster per km) → I am slower than them.
  assert.equal(buildPaceDiffSpeech('05:45/km', '05:30/km'), '페이스는 저보다 15초 빨라요');
  assert.equal(buildPaceDiffSpeech('05:30/km', '05:30/km'), '페이스는 비슷해요');
  assert.equal(buildPaceDiffSpeech('05:30/km', '--:--/km'), null);
  // An implausible opponent pace is suppressed for speech too.
  assert.equal(buildPaceDiffSpeech('05:30/km', '16:48/km'), null);
});

test('resolveGroupGapTargets resolves relative + absolute targets and dedupes', () => {
  const resolved = resolveGroupGapTargets(GROUP_STANDINGS, ['ahead1', 'rank1'], '05:30/km');
  assert.equal(resolved.length, 2);
  assert.deepEqual(
    resolved.map((entry) => [entry.label, entry.name, entry.gapKm]),
    [
      ['앞사람', '영희', -0.2],
      ['1등', '철수', -0.4],
    ],
  );
  // 영희's averagePace 05:20/km is faster than my 05:30/km → 영희 is 10s/km faster than me.
  assert.equal(resolved[0].paceDiff, '나보다 10초/km 빠름');
  assert.equal(resolved[0].paceDiffSpeech, '페이스는 저보다 10초 빨라요');

  // When I'm rank 2, 앞사람 and 1등 are the same runner — only one entry survives.
  const tightStandings = [
    standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2 }),
    standing({ id: 'me', name: '나', rank: 2, currentDistanceKm: 3.0, isCurrentUser: true }),
    standing({ id: 'c', name: '민수', rank: 3, currentDistanceKm: 2.5 }),
  ];
  const deduped = resolveGroupGapTargets(tightStandings, ['ahead1', 'rank1'], '05:30/km');
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].name, '철수');
  assert.equal(deduped[0].label, '앞사람');
});

test('resolveGroupGapTargets resolves behind1 to the next-lower-ranked runner', () => {
  // 철수(1위) · 나(2위, 가운데) · 민수(3위). behind1 = 나 바로 뒤(인덱스+1)인 민수.
  const midStandings = [
    standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2 }),
    standing({ id: 'me', name: '나', rank: 2, currentDistanceKm: 3.0, isCurrentUser: true }),
    standing({ id: 'c', name: '민수', rank: 3, currentDistanceKm: 2.5 }),
  ];
  const resolved = resolveGroupGapTargets(midStandings, ['behind1'], '05:30/km');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].label, '뒷사람');
  assert.equal(resolved[0].name, '민수');
  // me 3.0 - 민수 2.5 = +0.5km → 내가 앞섬.
  assert.equal(resolved[0].gapKm, 0.5);
});

test('resolveGroupGapTargets skips behind1 when I am in last place', () => {
  // GROUP_STANDINGS: 나는 꼴찌(3위) → 뒤에 아무도 없으므로 behind1은 줄을 만들지 않는다.
  const resolved = resolveGroupGapTargets(GROUP_STANDINGS, ['behind1'], '05:30/km');
  assert.equal(resolved.length, 0);
});

test('buildLiveGapOutput combines every selected duel metric into notification + speech', () => {
  const out = buildLiveGapOutput({
    matchMode: 'duel',
    metrics: ['remainingDistance', 'avgPace', 'opponentDistance', 'opponentPace'],
    remainingDistanceKm: 1.2,
    avgPaceLabel: '05:30/km',
    opponentName: '민희',
    opponentGapKm: 0.28,
    opponentPaceLabel: '05:45/km',
  });

  assert.equal(out.notification?.title, '대결 중간 점검');
  assert.equal(
    out.notification?.body,
    '남은 거리 1.20km\n평균 05:30/km\n민희 280m 앞, 나보다 15초/km 느림',
  );
  assert.equal(
    out.speech,
    '남은 거리 1.2킬로미터. 평균 페이스 5분 30초. 민희님보다 280미터 앞서고 있어요. 페이스는 저보다 15초 느려요.',
  );
});

test('buildLiveGapOutput honours metric selection (opponent distance only, behind)', () => {
  const out = buildLiveGapOutput({
    matchMode: 'duel',
    metrics: ['opponentDistance'],
    avgPaceLabel: '05:45/km',
    opponentName: '민희',
    opponentGapKm: -0.12,
    opponentPaceLabel: '05:30/km',
  });

  assert.equal(out.notification?.body, '민희 120m 뒤');
  assert.equal(out.speech, '민희님보다 120미터 뒤처졌어요.');
});

test('buildLiveGapOutput formats sub-kilometre remaining distance in metres', () => {
  const out = buildLiveGapOutput({
    matchMode: 'duel',
    metrics: ['remainingDistance'],
    remainingDistanceKm: 0.45,
  });

  assert.equal(out.notification?.body, '남은 거리 450m');
  assert.equal(out.speech, '남은 거리 450미터.');
});

test('buildLiveGapOutput builds a per-target group push with rank in the title', () => {
  const out = buildLiveGapOutput({
    matchMode: 'group',
    metrics: ['opponentDistance', 'opponentPace'],
    avgPaceLabel: '05:30/km',
    standings: GROUP_STANDINGS,
    groupTargets: ['ahead1', 'rank1'],
  });

  assert.equal(out.notification?.title, '중간 점검 · 현재 3위');
  assert.equal(
    out.notification?.body,
    '앞사람 영희: 200m 뒤, 나보다 10초/km 빠름\n1등 철수: 400m 뒤, 나보다 30초/km 빠름',
  );
  assert.equal(
    out.speech,
    '앞사람 영희님보다 200미터 뒤처졌어요. 페이스는 저보다 10초 빨라요. 1등 철수님보다 400미터 뒤처졌어요. 페이스는 저보다 30초 빨라요.',
  );
});

test('buildLiveGapOutput drops the pace fragment when the opponent pace is implausible', () => {
  // Real bug: a background-stale opponent ('A6') feeds a garbage 16:48/km average. The
  // distance line must still render; the pace fragment is omitted, not printed as "null".
  const out = buildLiveGapOutput({
    matchMode: 'duel',
    metrics: ['opponentDistance', 'opponentPace'],
    avgPaceLabel: '05:30/km',
    opponentName: 'A6',
    opponentGapKm: -0.05,
    opponentPaceLabel: '16:48/km',
  });

  assert.equal(out.notification?.body, 'A6 50m 뒤');
  assert.ok(!out.notification?.body.includes('초/km'));
  assert.ok(!out.notification?.body.includes('null'));
  assert.equal(out.speech, 'A6님보다 50미터 뒤처졌어요.');
});

test('buildLiveGapOutput returns nulls when nothing is selected or data is missing', () => {
  assert.deepEqual(
    buildLiveGapOutput({ matchMode: 'duel', metrics: [] }),
    { notification: null, speech: null },
  );
  // Opponent distance selected but the gap has not synced yet → nothing to push.
  assert.deepEqual(
    buildLiveGapOutput({ matchMode: 'duel', metrics: ['opponentDistance'], opponentGapKm: null }),
    { notification: null, speech: null },
  );
  // Average pace selected but still unmeasured → excluded, leaving nothing.
  assert.deepEqual(
    buildLiveGapOutput({ matchMode: 'duel', metrics: ['avgPace'], avgPaceLabel: '--:--/km' }),
    { notification: null, speech: null },
  );
});
