import assert from 'node:assert/strict';
import test from 'node:test';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  buildDuelGapMessage,
  buildDuelGapSpeech,
  buildGroupGapMessage,
  buildGroupGapSpeech,
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

test('parseMeasuredPaceSecondsPerKm returns null for placeholder paces', () => {
  assert.equal(parseMeasuredPaceSecondsPerKm('05:30/km'), 330);
  assert.equal(parseMeasuredPaceSecondsPerKm('5:30/km'), 330);
  assert.equal(parseMeasuredPaceSecondsPerKm('--:--/km'), null);
  assert.equal(parseMeasuredPaceSecondsPerKm('00:00/km'), null);
  assert.equal(parseMeasuredPaceSecondsPerKm(''), null);
  assert.equal(parseMeasuredPaceSecondsPerKm(null), null);
});

test('buildPaceDiffLabel describes my pace relative to the other runner', () => {
  assert.equal(buildPaceDiffLabel('05:30/km', '05:45/km'), '15초/km 빠름');
  assert.equal(buildPaceDiffLabel('05:45/km', '05:30/km'), '15초/km 느림');
  assert.equal(buildPaceDiffLabel('05:30/km', '05:30/km'), '페이스 비슷');
  assert.equal(buildPaceDiffLabel('05:30/km', '--:--/km'), null);
  assert.equal(buildPaceDiffLabel(null, '05:30/km'), null);
});

test('buildDuelGapMessage returns null without a distance gap', () => {
  assert.equal(
    buildDuelGapMessage({ opponentName: '민희', myPaceLabel: '05:30/km', opponentPaceLabel: '05:45/km', gapKm: null }),
    null,
  );
});

test('buildDuelGapMessage reports who is ahead with pace context', () => {
  const ahead = buildDuelGapMessage({
    opponentName: '민희',
    myPaceLabel: '05:30/km',
    opponentPaceLabel: '05:45/km',
    gapKm: 0.28,
  });
  assert.equal(ahead?.title, '민희보다 280m 앞');
  assert.equal(ahead?.body, '내 페이스 05:30/km · 상대 05:45/km (15초/km 빠름)');

  const behind = buildDuelGapMessage({
    opponentName: '민희',
    myPaceLabel: '05:45/km',
    opponentPaceLabel: '05:30/km',
    gapKm: -0.12,
  });
  assert.equal(behind?.title, '민희보다 120m 뒤');
  assert.equal(behind?.body, '내 페이스 05:45/km · 상대 05:30/km (15초/km 느림)');
});

test('buildDuelGapMessage handles a dead heat and missing names/paces', () => {
  const tie = buildDuelGapMessage({
    opponentName: null,
    myPaceLabel: '--:--/km',
    opponentPaceLabel: '--:--/km',
    gapKm: 0.003,
  });
  assert.equal(tie?.title, '상대와 거의 동률');
  assert.equal(tie?.body, '내 페이스 --:--/km · 상대 --:--/km');

  const kmGap = buildDuelGapMessage({
    opponentName: '민희',
    myPaceLabel: '05:30/km',
    opponentPaceLabel: '06:10/km',
    gapKm: 1.4,
  });
  assert.equal(kmGap?.title, '민희보다 1.40km 앞');
});

test('resolveGroupGapTargets resolves relative + absolute targets and dedupes', () => {
  const standings = [
    standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2, averagePace: '05:00/km' }),
    standing({ id: 'b', name: '영희', rank: 2, currentDistanceKm: 3.0, averagePace: '05:20/km' }),
    standing({ id: 'me', name: '나', rank: 3, currentDistanceKm: 2.8, averagePace: '05:30/km', isCurrentUser: true }),
  ];

  const resolved = resolveGroupGapTargets(standings, ['ahead1', 'rank1'], '05:30/km');
  assert.equal(resolved.length, 2);
  assert.deepEqual(
    resolved.map((entry) => [entry.label, entry.name, entry.gapKm]),
    [
      ['앞사람', '영희', -0.2],
      ['1등', '철수', -0.4],
    ],
  );

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

test('buildGroupGapMessage builds a multi-line body and bails when I am absent', () => {
  const standings = [
    standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2, averagePace: '05:00/km' }),
    standing({ id: 'b', name: '영희', rank: 2, currentDistanceKm: 3.0, averagePace: '05:20/km' }),
    standing({ id: 'me', name: '나', rank: 3, currentDistanceKm: 2.8, averagePace: '05:30/km', isCurrentUser: true }),
  ];

  const message = buildGroupGapMessage({ standings, selectedTargets: ['ahead1', 'rank1'], myPaceLabel: '05:30/km' });
  assert.equal(message?.title, '중간 점검 · 현재 3위');
  assert.equal(message?.body, '앞사람 영희: 200m 뒤, 10초/km 느림\n1등 철수: 400m 뒤, 30초/km 느림');

  assert.equal(
    buildGroupGapMessage({ standings: [], selectedTargets: ['ahead1'], myPaceLabel: '05:30/km' }),
    null,
  );
  // No targets selected → nothing to push.
  assert.equal(
    buildGroupGapMessage({ standings, selectedTargets: [], myPaceLabel: '05:30/km' }),
    null,
  );
});

test('buildPaceDiffSpeech phrases the pace gap for TTS', () => {
  assert.equal(buildPaceDiffSpeech('05:30/km', '05:45/km'), '페이스는 15초 빨라요');
  assert.equal(buildPaceDiffSpeech('05:45/km', '05:30/km'), '페이스는 15초 느려요');
  assert.equal(buildPaceDiffSpeech('05:30/km', '05:30/km'), '페이스는 비슷해요');
  assert.equal(buildPaceDiffSpeech('05:30/km', '--:--/km'), null);
});

test('buildDuelGapSpeech reads a natural sentence with the right particle', () => {
  assert.equal(
    buildDuelGapSpeech({ opponentName: '민희', myPaceLabel: '05:30/km', opponentPaceLabel: '05:45/km', gapKm: 0.28 }),
    '민희님보다 280미터 앞서고 있어요. 페이스는 15초 빨라요.',
  );
  assert.equal(
    buildDuelGapSpeech({ opponentName: '민희', myPaceLabel: '05:45/km', opponentPaceLabel: '05:30/km', gapKm: -0.12 }),
    '민희님보다 120미터 뒤처졌어요. 페이스는 15초 느려요.',
  );
  // km-scale gap reads with one decimal; missing names fall back to '상대' + 와 particle.
  assert.equal(
    buildDuelGapSpeech({ opponentName: '민희', myPaceLabel: '05:30/km', opponentPaceLabel: '06:10/km', gapKm: 1.4 }),
    '민희님보다 1.4킬로미터 앞서고 있어요. 페이스는 40초 빨라요.',
  );
  assert.equal(
    buildDuelGapSpeech({ opponentName: null, myPaceLabel: '--:--/km', opponentPaceLabel: '--:--/km', gapKm: 0.003 }),
    '상대와 거의 같아요.',
  );
  assert.equal(
    buildDuelGapSpeech({ opponentName: '민희', myPaceLabel: '05:30/km', opponentPaceLabel: '05:45/km', gapKm: null }),
    null,
  );
});

test('buildGroupGapSpeech reads rank and each chosen runner', () => {
  const standings = [
    standing({ id: 'a', name: '철수', rank: 1, currentDistanceKm: 3.2, averagePace: '05:00/km' }),
    standing({ id: 'b', name: '영희', rank: 2, currentDistanceKm: 3.0, averagePace: '05:20/km' }),
    standing({ id: 'me', name: '나', rank: 3, currentDistanceKm: 2.8, averagePace: '05:30/km', isCurrentUser: true }),
  ];

  assert.equal(
    buildGroupGapSpeech({ standings, selectedTargets: ['ahead1', 'rank1'], myPaceLabel: '05:30/km' }),
    '현재 3위. 앞사람 영희님보다 200미터 뒤처졌어요. 1등 철수님보다 400미터 뒤처졌어요.',
  );
  assert.equal(buildGroupGapSpeech({ standings: [], selectedTargets: ['ahead1'], myPaceLabel: '05:30/km' }), null);
});
