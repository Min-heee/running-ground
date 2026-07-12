import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunMatchResult } from '@/domain';
import { buildRunMatchResultCardModel } from './runMatchResultCardModel';

function matchResult(overrides: Partial<RunMatchResult> = {}): RunMatchResult {
  return {
    mode: 'duel',
    title: '1대1 대결',
    summary: '',
    badgeLabel: '승리',
    resultTone: 'win',
    ...overrides,
  };
}

test('card model: official duel win shows rank LP', () => {
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ source: 'official', resultTone: 'win' }),
  });

  assert.equal(model.lpDelta, 20);
  assert.equal(model.isLpGain, true);
  assert.equal(model.showLp, true);
  assert.equal(model.isParty, false);
  assert.equal(model.typeLabel, '1대1 대결');
});

test('card model: official duel loss shows negative rank LP', () => {
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ source: 'official', resultTone: 'lose' }),
  });

  assert.equal(model.lpDelta, -20);
  assert.equal(model.isLpGain, false);
  assert.equal(model.showLp, true);
});

test('card model: party duel never shows rank LP even on a win', () => {
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ source: 'party', resultTone: 'win' }),
  });

  assert.equal(model.showLp, false);
  assert.equal(model.isParty, true);
  assert.equal(model.typeLabel, '1대1 파티런');
});

test('card model: missing source is treated as party — no rank LP leak', () => {
  // A record whose source the backend never persisted must NOT show rank LP
  // (matches getRunKind's split: only source === 'official' is ranked).
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ source: undefined, resultTone: 'win' }),
  });

  assert.equal(model.showLp, false);
  assert.equal(model.isParty, true);
  assert.equal(model.typeLabel, '1대1 파티런');
});

test('card model: official group labels and LP gate on zero delta', () => {
  const withPlacement = buildRunMatchResultCardModel({
    matchResult: matchResult({ mode: 'group', source: 'official', resultTone: undefined, rank: 1, participantCount: 4 }),
  });
  const withoutPlacement = buildRunMatchResultCardModel({
    matchResult: matchResult({ mode: 'group', source: 'official', resultTone: undefined }),
  });

  assert.equal(withPlacement.typeLabel, '그룹 대결');
  assert.equal(withPlacement.showLp, true);
  assert.equal(withPlacement.groupRankText, '4명 중 1위');
  // No valid placement → estimated delta 0 → the pill must not render even though official.
  assert.equal(withoutPlacement.lpDelta, 0);
  assert.equal(withoutPlacement.showLp, false);
});

test('card model: matchId prefers the persisted blob value over the navigation fallback', () => {
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ matchId: 'blob-match-id' }),
    matchId: 'navigation-match-id',
  });

  assert.equal(model.resultMatchId, 'blob-match-id');
  assert.equal(model.canOpenResult, true);
});

test('card model: matchId falls back to the navigation param when the blob has none', () => {
  const fromNavigation = buildRunMatchResultCardModel({
    matchResult: matchResult({ matchId: undefined }),
    matchId: 'navigation-match-id',
  });
  const paddedBlob = buildRunMatchResultCardModel({
    matchResult: matchResult({ matchId: '   ' }),
    matchId: ' navigation-match-id ',
  });

  assert.equal(fromNavigation.resultMatchId, 'navigation-match-id');
  // A padded/empty persisted string is trimmed away and must not win the chain.
  assert.equal(paddedBlob.resultMatchId, 'navigation-match-id');
});

test('card model: no matchId anywhere → static card (cannot open result)', () => {
  const model = buildRunMatchResultCardModel({
    matchResult: matchResult({ matchId: undefined }),
  });

  assert.equal(model.resultMatchId, null);
  assert.equal(model.canOpenResult, false);
});

test('card model: mode falls back from blob to navigation param', () => {
  const blobWins = buildRunMatchResultCardModel({
    matchResult: matchResult({ mode: 'group' }),
    mode: 'duel',
  });

  assert.equal(blobWins.resultMode, 'group');
});

test('card model: my pace/duration prefer the matchResult then the run-record fallback', () => {
  const fromBlob = buildRunMatchResultCardModel({
    matchResult: matchResult({ myPaceLabel: "5'30\"", myDurationSeconds: 3725, opponentDurationSeconds: 610 }),
    myPaceLabel: "6'00\"",
    myDurationSeconds: 600,
  });
  const fromRunRecord = buildRunMatchResultCardModel({
    matchResult: matchResult({}),
    myPaceLabel: "6'00\"",
    myDurationSeconds: 600,
  });

  assert.equal(fromBlob.myDisplayPaceLabel, "5'30\"");
  assert.equal(fromBlob.myDurationLabel, '1:02:05');
  assert.equal(fromBlob.opponentDurationLabel, '10:10');
  assert.equal(fromRunRecord.myDisplayPaceLabel, "6'00\"");
  assert.equal(fromRunRecord.myDurationLabel, '10:00');
  assert.equal(fromRunRecord.opponentDurationLabel, null);
});
