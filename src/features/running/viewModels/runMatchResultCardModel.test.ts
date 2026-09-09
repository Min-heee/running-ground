import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunMatchResult } from '@/domain';
import { buildDuelBoardRows, buildGroupBoardRows, buildRunMatchResultCardModel, formatPaceLabelFromSeconds } from './runMatchResultCardModel';

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

test('duel board rows: winner first with WIN/LOSE leads, draw shows 무', () => {
  const winRows = buildDuelBoardRows({
    matchResult: { resultTone: 'win', opponentName: '준호', opponentPaceLabel: '10:00/km' },
    myDisplayPaceLabel: '12:30/km',
    myDurationLabel: '00:15',
    opponentDurationLabel: '00:14',
    ownerName: '민병희',
  });
  // 오너 2026-08-28: 내 행도 무조건 기록 주인의 닉네임 — '나'는 이름 부재 폴백뿐.
  assert.deepEqual(winRows.map((row) => [row.leadLabel, row.name, row.isMe]), [
    ['WIN', '민병희', true],
    ['LOSE', '준호', false],
  ]);
  assert.equal(winRows[0].metricLabel, '12:30/km · 00:15');

  // ownerName 부재(옛 링크/이름 없는 프로필)만 '나' 폴백.
  const fallbackRows = buildDuelBoardRows({
    matchResult: { resultTone: 'win', opponentName: '준호', opponentPaceLabel: undefined },
    myDisplayPaceLabel: null,
    myDurationLabel: null,
    opponentDurationLabel: null,
    ownerName: '  ',
  });
  assert.equal(fallbackRows[0].name, '나');

  const loseRows = buildDuelBoardRows({
    matchResult: { resultTone: 'lose', opponentName: '준호', opponentPaceLabel: undefined },
    myDisplayPaceLabel: null,
    myDurationLabel: null,
    opponentDurationLabel: null,
  });
  assert.deepEqual(loseRows.map((row) => [row.leadLabel, row.isMe]), [['WIN', false], ['LOSE', true]]);

  const drawRows = buildDuelBoardRows({
    matchResult: { resultTone: 'draw', opponentName: '준호', opponentPaceLabel: undefined },
    myDisplayPaceLabel: null,
    myDurationLabel: null,
    opponentDurationLabel: null,
  });
  assert.deepEqual(drawRows.map((row) => row.leadLabel), ['무', '무']);
});

test('group board rows: top 3 only, my row appended when outside the podium', () => {
  const participant = (rank: number, isMe = false, forfeited = false) => ({
    name: `러너${rank}`,
    paceSecondsPerKm: 360 + rank,
    finishElapsedSeconds: 1200 + rank,
    rank,
    forfeited,
    isMe,
  });

  const meInTop = buildGroupBoardRows([participant(1, true), participant(2), participant(3), participant(4)]);
  assert.deepEqual(meInTop.map((row) => [row.leadLabel, row.isMe]), [['1', true], ['2', false], ['3', false]]);
  // 오너 2026-08-28: 내 행도 /result의 실제 닉네임 그대로 — '나'는 이름 부재 폴백뿐.
  assert.equal(meInTop[0].name, '러너1');
  assert.equal(meInTop[0].rankNumber, 1);
  assert.equal(
    buildGroupBoardRows([{ ...participant(1, true), name: ' ' }, participant(2), participant(3)])[0].name,
    '나',
  );

  const meOutside = buildGroupBoardRows([
    participant(1), participant(2), participant(3), participant(4), participant(5, true),
  ]);
  assert.deepEqual(meOutside.map((row) => [row.leadLabel, row.isMe]), [
    ['1', false], ['2', false], ['3', false], ['5', true],
  ]);

  // 기권자는 순위가 있으면 행에 남고 지표 대신 '기권'.
  const withForfeit = buildGroupBoardRows([participant(1), participant(2, false, true), participant(3, true)]);
  assert.equal(withForfeit[1].metricLabel, '기권');
});

test('formatPaceLabelFromSeconds renders mm:ss/km and rejects invalid input', () => {
  assert.equal(formatPaceLabelFromSeconds(393), '06:33/km');
  assert.equal(formatPaceLabelFromSeconds(600), '10:00/km');
  assert.equal(formatPaceLabelFromSeconds(null), null);
  assert.equal(formatPaceLabelFromSeconds(0), null);
});

test('duel board rows: missing tone (집계 중) shows — not 무', () => {
  const rows = buildDuelBoardRows({
    matchResult: { opponentName: '준호', opponentPaceLabel: undefined },
    myDisplayPaceLabel: null,
    myDurationLabel: null,
    opponentDurationLabel: null,
  });
  assert.deepEqual(rows.map((row) => row.leadLabel), ['—', '—']);
});

test('실격 표기 (오너 규칙 2026-09-09): 그룹 보드 행은 실격자에게 기권 대신 실격, 듀얼 보드 내 행은 실격패 블롭이면 LOSE 대신 실격', () => {
  const participant = (rank: number, overrides: Partial<{ isMe: boolean; forfeited: boolean; disqualified: boolean }> = {}) => ({
    name: `러너${rank}`,
    paceSecondsPerKm: 360 + rank,
    finishElapsedSeconds: 1200 + rank,
    rank,
    forfeited: false,
    isMe: false,
    ...overrides,
  });
  const rows = buildGroupBoardRows([
    participant(1),
    participant(2, { forfeited: true, disqualified: true }),
    participant(3, { isMe: true, forfeited: true }),
  ]);
  assert.equal(rows[1].metricLabel, '실격');
  assert.equal(rows[2].metricLabel, '기권');

  const disqualifiedRows = buildDuelBoardRows({
    matchResult: matchResult({ resultTone: 'lose', disqualified: true, opponentName: '준호', opponentPaceLabel: '05:00/km' }),
    myDisplayPaceLabel: '09:00/km',
    myDurationLabel: '10:00',
    opponentDurationLabel: '25:00',
  });
  // 승자(상대) 먼저, 내 행은 실격 배지에 패배 톤.
  assert.deepEqual(disqualifiedRows.map((row) => [row.leadLabel, row.leadTone, row.isMe]), [
    ['WIN', 'win', false],
    ['실격', 'lose', true],
  ]);

  const plainLoseRows = buildDuelBoardRows({
    matchResult: matchResult({ resultTone: 'lose', opponentName: '준호' }),
    myDisplayPaceLabel: null,
    myDurationLabel: null,
    opponentDurationLabel: null,
  });
  assert.equal(plainLoseRows[1].leadLabel, 'LOSE');
});
