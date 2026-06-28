import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunMatchResult } from '@/domain';
import type { DuelVerdict, GroupVerdict, RunningMatchStatusResponse } from '@/lib/api/types';
import {
  deriveSavedMatchReconcileContext,
  isUnresolvedDuelMatchResult,
  isUnresolvedGroupMatchResult,
  reconcileDuelRunDetailMatchResult,
  reconcileGroupRunDetailMatchResult,
} from './runDetailMatchReconcile';

function duelStatus(verdict: DuelVerdict | undefined): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'duel',
    state: 'active',
    distanceKm: 5,
    slotStartAt: '2026-06-18T00:00:00.000Z',
    slotLabel: '오전 9시',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 2,
    acceptedCount: 2,
    capacity: 2,
    userAccepted: true,
    readyToStart: true,
    matchId: 'm1',
    opponent: {
      id: 'opp',
      name: '상대',
      districtName: '',
      averagePace: '5:30/km',
      levelLabel: '',
      weeklyDistanceKm: 0,
      lifetimeDistanceKm: 0,
      compatibilitySummary: '',
    },
    ...(verdict ? { duelVerdict: verdict } : {}),
  };
}

const resolvedWinVerdict: DuelVerdict = {
  resolved: true,
  winnerUserId: 'me',
  outcome: 'win',
  myFinishElapsedSeconds: 1500,
  opponentFinishElapsedSeconds: 1560,
  myPaceLabel: '5:00/km',
  opponentPaceLabel: '5:12/km',
};

test('C3: isUnresolvedDuelMatchResult flags a placeholder record as unresolved', () => {
  const placeholder: RunMatchResult = {
    mode: 'duel',
    title: '상대가 완주하면 결과표가 업데이트돼요',
    summary: '',
    badgeLabel: '대결 결과',
    myDurationSeconds: 1500,
    // No definite tone, no opponent duration → unresolved.
  };
  assert.equal(isUnresolvedDuelMatchResult(placeholder), true);
});

test('C1/C3: a PENDING saved record (결과 집계 중, no tone) is reconcilable and upgrades to the official verdict', () => {
  // The shape the server/client now persist when the verdict is unresolved at save: a neutral
  // "결과 집계 중" badge and NO resultTone. It must NOT be treated as final (the old bug refused
  // to reconcile an already-'win' record) and must upgrade to the official verdict on re-query.
  const pending: RunMatchResult = {
    mode: 'duel',
    title: '대결 결과를 집계하고 있어요',
    summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
    badgeLabel: '결과 집계 중',
    opponentName: '상대',
    myDurationSeconds: 1500,
    myPaceLabel: '5:00/km',
    // No resultTone, no opponent duration → unresolved/reconcilable.
  };
  assert.equal(isUnresolvedDuelMatchResult(pending), true);

  const reconciled = reconcileDuelRunDetailMatchResult({
    matchResult: pending,
    status: duelStatus(resolvedWinVerdict),
  });
  assert.equal(reconciled?.resultTone, 'win');
  assert.equal(reconciled?.badgeLabel, '승리');
  assert.equal(reconciled?.opponentDurationSeconds, 1560);
});

test('C3: a complete saved record is NOT unresolved and is left untouched', () => {
  const complete: RunMatchResult = {
    mode: 'duel',
    title: '상대님을 이겼어요',
    summary: '',
    badgeLabel: '승리',
    resultTone: 'win',
    myDurationSeconds: 1500,
    opponentDurationSeconds: 1560,
    myPaceLabel: '5:00/km',
    opponentPaceLabel: '5:12/km',
  };
  assert.equal(isUnresolvedDuelMatchResult(complete), false);
  // Even with a resolved verdict, a good record is not downgraded/overwritten.
  assert.equal(
    reconcileDuelRunDetailMatchResult({ matchResult: complete, status: duelStatus(resolvedWinVerdict) }),
    null,
  );
});

test('C3: forfeit record is never reconciled away', () => {
  const forfeit: RunMatchResult = {
    mode: 'duel',
    title: '기권으로 대결을 마쳤어요',
    summary: '',
    badgeLabel: '기권 패',
    resultTone: 'lose',
  };
  assert.equal(isUnresolvedDuelMatchResult(forfeit), false);
  assert.equal(
    reconcileDuelRunDetailMatchResult({ matchResult: forfeit, status: duelStatus(resolvedWinVerdict) }),
    null,
  );
});

test('C3: an unresolved record is reconciled from the resolved server verdict', () => {
  const placeholder: RunMatchResult = {
    mode: 'duel',
    title: '상대가 완주하면 결과표가 업데이트돼요',
    summary: '',
    badgeLabel: '대결 결과',
    opponentId: 'opp',
    opponentName: '상대',
    myDurationSeconds: 1490,
  };

  const reconciled = reconcileDuelRunDetailMatchResult({
    matchResult: placeholder,
    status: duelStatus(resolvedWinVerdict),
  });

  assert.ok(reconciled);
  assert.equal(reconciled?.resultTone, 'win');
  assert.equal(reconciled?.badgeLabel, '승리');
  assert.equal(reconciled?.myDurationSeconds, 1500);
  assert.equal(reconciled?.opponentDurationSeconds, 1560);
  assert.equal(reconciled?.myPaceLabel, '5:00/km');
  assert.equal(reconciled?.opponentPaceLabel, '5:12/km');
});

test('C3: no reconciliation when the verdict is still pending', () => {
  const placeholder: RunMatchResult = {
    mode: 'duel',
    title: '',
    summary: '',
    badgeLabel: '대결 결과',
    myDurationSeconds: 1490,
  };
  const pendingVerdict: DuelVerdict = {
    resolved: false,
    winnerUserId: null,
    outcome: 'pending',
    myFinishElapsedSeconds: 1490,
    opponentFinishElapsedSeconds: null,
    myPaceLabel: '5:00/km',
    opponentPaceLabel: null,
  };
  assert.equal(
    reconcileDuelRunDetailMatchResult({ matchResult: placeholder, status: duelStatus(pendingVerdict) }),
    null,
  );
});

test('C3: no reconciliation when the backend omits duelVerdict (deploy skew)', () => {
  const placeholder: RunMatchResult = {
    mode: 'duel',
    title: '',
    summary: '',
    badgeLabel: '대결 결과',
    myDurationSeconds: 1490,
  };
  assert.equal(
    reconcileDuelRunDetailMatchResult({ matchResult: placeholder, status: duelStatus(undefined) }),
    null,
  );
});

// ---------------------------------------------------------------------------
// Group parity: reconcile a saved group placeholder against the server group verdict.
// ---------------------------------------------------------------------------

function groupStatus(verdict: GroupVerdict | undefined): RunningMatchStatusResponse {
  return {
    success: true,
    mode: 'group',
    state: 'active',
    distanceKm: 5,
    slotStartAt: '2026-06-18T00:00:00.000Z',
    slotLabel: '오전 9시',
    paceBandLabel: '',
    levelBandLabel: '',
    criteriaSummary: '',
    estimatedWaitMinutes: 0,
    participantCount: 3,
    acceptedCount: 3,
    capacity: 30,
    userAccepted: true,
    readyToStart: true,
    matchId: 'g1',
    ...(verdict ? { groupVerdict: verdict } : {}),
  };
}

const resolvedGroupVerdict: GroupVerdict = {
  resolved: true,
  myRank: 2,
  participants: [
    { userId: 'leader', rank: 1, finishElapsedSeconds: 1500, paceLabel: '5:00/km', forfeited: false, finished: true },
    { userId: 'me', rank: 2, finishElapsedSeconds: 1560, paceLabel: '5:12/km', forfeited: false, finished: true },
    { userId: 'third', rank: 3, finishElapsedSeconds: 1620, paceLabel: '5:24/km', forfeited: false, finished: true },
  ],
};

test('group parity: isUnresolvedGroupMatchResult flags a rank-less PENDING record as unresolved', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    myDurationSeconds: 1560,
    // No rank → unresolved/reconcilable.
  };
  assert.equal(isUnresolvedGroupMatchResult(pending), true);
});

test('group parity: a PENDING group record upgrades to the official server placement on re-query', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    title: '그룹 결과를 집계하고 있어요',
    summary: '다른 참가자가 완주하면 순위가 자동으로 업데이트돼요.',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    myDurationSeconds: 1560,
    myPaceLabel: '5:12/km',
  };

  const reconciled = reconcileGroupRunDetailMatchResult({
    matchResult: pending,
    status: groupStatus(resolvedGroupVerdict),
  });

  assert.ok(reconciled);
  assert.equal(reconciled?.rank, 2);
  assert.equal(reconciled?.badgeLabel, '2위');
  assert.match(reconciled?.title ?? '', /2위/);
  assert.equal(reconciled?.myDurationSeconds, 1560);
});

test('group parity: a complete (ranked) group record is NOT unresolved and is left untouched', () => {
  const complete: RunMatchResult = {
    mode: 'group',
    title: '3명 중 2위로 마쳤어요',
    summary: '',
    badgeLabel: '2위',
    rank: 2,
    participantCount: 3,
  };
  assert.equal(isUnresolvedGroupMatchResult(complete), false);
  assert.equal(
    reconcileGroupRunDetailMatchResult({ matchResult: complete, status: groupStatus(resolvedGroupVerdict) }),
    null,
  );
});

test('group parity: a group forfeit record is never reconciled away', () => {
  const forfeit: RunMatchResult = {
    mode: 'group',
    title: '기권으로 그룹 대결을 마쳤어요',
    summary: '',
    badgeLabel: '기권',
    participantCount: 3,
  };
  assert.equal(isUnresolvedGroupMatchResult(forfeit), false);
  assert.equal(
    reconcileGroupRunDetailMatchResult({ matchResult: forfeit, status: groupStatus(resolvedGroupVerdict) }),
    null,
  );
});

test('group parity: no reconciliation when the verdict is still unresolved (graceful PENDING hold)', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    myDurationSeconds: 1560,
  };
  const unresolvedVerdict: GroupVerdict = {
    resolved: false,
    myRank: null,
    participants: resolvedGroupVerdict.participants,
  };
  assert.equal(
    reconcileGroupRunDetailMatchResult({ matchResult: pending, status: groupStatus(unresolvedVerdict) }),
    null,
  );
});

test('group parity: no reconciliation when the backend omits groupVerdict (deploy skew → stays PENDING, never crashes)', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    myDurationSeconds: 1560,
  };
  assert.equal(
    reconcileGroupRunDetailMatchResult({ matchResult: pending, status: groupStatus(undefined) }),
    null,
  );
});

// ---------------------------------------------------------------------------
// Saved-matchResult gate: a PENDING record re-queries from its OWN fields (matchId + mode +
// compared distance), with NO route params — so re-opening it from 내 활동 / 기록 / 친구 reconciles.
// ---------------------------------------------------------------------------

test('saved-gate: a PENDING duel record (no route params) yields a reconcile context from its own fields', () => {
  const pending: RunMatchResult = {
    mode: 'duel',
    matchId: 'm-duel-1',
    title: '대결 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    opponentName: '상대',
    comparedDistanceKm: 5,
    myDurationSeconds: 1500,
    myPaceLabel: '5:00/km',
  };
  const context = deriveSavedMatchReconcileContext(pending);
  assert.deepEqual(context, { matchId: 'm-duel-1', mode: 'duel', distanceKm: 5 });
});

test('saved-gate: a PENDING group record yields a reconcile context from its own fields', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    matchId: 'm-group-1',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    comparedDistanceKm: 3,
    myDurationSeconds: 1560,
  };
  const context = deriveSavedMatchReconcileContext(pending);
  assert.deepEqual(context, { matchId: 'm-group-1', mode: 'group', distanceKm: 3 });
});

test('saved-gate: a RESOLVED record yields NO reconcile context (no re-query, never downgraded)', () => {
  const resolvedDuel: RunMatchResult = {
    mode: 'duel',
    matchId: 'm-duel-2',
    title: '상대님을 이겼어요',
    summary: '',
    badgeLabel: '승리',
    resultTone: 'win',
    comparedDistanceKm: 5,
    myDurationSeconds: 1500,
    opponentDurationSeconds: 1560,
    myPaceLabel: '5:00/km',
    opponentPaceLabel: '5:12/km',
  };
  assert.equal(deriveSavedMatchReconcileContext(resolvedDuel), null);

  const rankedGroup: RunMatchResult = {
    mode: 'group',
    matchId: 'm-group-2',
    title: '3명 중 2위로 마쳤어요',
    summary: '',
    badgeLabel: '2위',
    rank: 2,
    participantCount: 3,
    comparedDistanceKm: 5,
  };
  assert.equal(deriveSavedMatchReconcileContext(rankedGroup), null);
});

test('saved-gate: a forfeit record or a record without a matchId yields NO reconcile context', () => {
  const forfeit: RunMatchResult = {
    mode: 'duel',
    matchId: 'm-duel-3',
    title: '기권으로 대결을 마쳤어요',
    summary: '',
    badgeLabel: '기권 패',
    resultTone: 'lose',
  };
  assert.equal(deriveSavedMatchReconcileContext(forfeit), null);

  const noMatchId: RunMatchResult = {
    mode: 'duel',
    title: '대결 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    myDurationSeconds: 1500,
  };
  assert.equal(deriveSavedMatchReconcileContext(noMatchId), null);

  assert.equal(deriveSavedMatchReconcileContext(null), null);
});

test('saved-gate: a PENDING record missing comparedDistanceKm still reconciles (distance 0 sentinel; backend is lenient with a matchId)', () => {
  const pending: RunMatchResult = {
    mode: 'duel',
    matchId: 'm-duel-4',
    title: '대결 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    myDurationSeconds: 1500,
  };
  const context = deriveSavedMatchReconcileContext(pending);
  assert.deepEqual(context, { matchId: 'm-duel-4', mode: 'duel', distanceKm: 0 });
});
