import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunMatchResult } from '@/domain';
import type {
  DuelVerdict,
  GroupVerdict,
  MatchResultResponse,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import {
  buildUnresolvedTerminalMatchResult,
  deriveSavedMatchReconcileContext,
  isUnresolvedDuelMatchResult,
  isUnresolvedGroupMatchResult,
  MATCH_RESULT_PENDING_TERMINAL_AGE_MS,
  reconcileDuelRunDetailMatchResult,
  reconcileDuelRunDetailMatchResultFromResult,
  reconcileGroupRunDetailMatchResult,
  reconcileGroupRunDetailMatchResultFromResult,
  shouldTerminalizeUnresolvedMatchResult,
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

// ---------------------------------------------------------------------------
// §3-⑦ /result fallback: reconcile a PENDING record from the by-matchId GET /result
// response (heals post-prune records where /status goes idle-shaped).
// ---------------------------------------------------------------------------

function duelResult(overrides: Partial<MatchResultResponse> = {}): MatchResultResponse {
  return {
    matchId: 'm1',
    mode: 'duel',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      {
        userId: 'me',
        name: '나',
        districtName: null,
        provinceName: null,
        cityName: null,
        paceSecondsPerKm: 300,
        finishElapsedSeconds: 1500,
        distanceKm: 5,
        rank: 1,
        resultTone: 'win',
        forfeited: false,
        isMe: true,
      },
      {
        userId: 'opp',
        name: '상대',
        districtName: null,
        provinceName: null,
        cityName: null,
        paceSecondsPerKm: 312,
        finishElapsedSeconds: 1560,
        distanceKm: 5,
        rank: 2,
        resultTone: 'lose',
        forfeited: false,
        isMe: false,
      },
    ],
    ...overrides,
  };
}

const pendingDuelBlob: RunMatchResult = {
  mode: 'duel',
  matchId: 'm1',
  title: '대결 결과를 집계하고 있어요',
  summary: '상대가 완주하면 결과가 자동으로 업데이트돼요.',
  badgeLabel: '결과 집계 중',
  opponentName: '상대',
  comparedDistanceKm: 5,
  myDurationSeconds: 1500,
  myPaceLabel: '5:00/km',
};

test('§3-⑦: a PENDING duel record reconciles from the /result participant pair (tone from MY row)', () => {
  const reconciled = reconcileDuelRunDetailMatchResultFromResult({
    matchResult: pendingDuelBlob,
    result: duelResult(),
  });

  assert.ok(reconciled);
  assert.equal(reconciled?.resultTone, 'win');
  assert.equal(reconciled?.badgeLabel, '승리');
  assert.equal(reconciled?.myDurationSeconds, 1500);
  assert.equal(reconciled?.opponentDurationSeconds, 1560);
  assert.equal(reconciled?.myPaceLabel, '05:00/km');
  assert.equal(reconciled?.opponentPaceLabel, '05:12/km');
  // Not provisional/revised unless the server says so.
  assert.equal(reconciled?.provisional, undefined);
  assert.equal(reconciled?.revised, undefined);
});

test('§3-⑦: my tone falls back to rank order when the /result rows carry no resultTone', () => {
  const result = duelResult();
  result.participants = result.participants.map((row) => ({ ...row, resultTone: null }));
  const reconciled = reconcileDuelRunDetailMatchResultFromResult({
    matchResult: pendingDuelBlob,
    result,
  });
  assert.equal(reconciled?.resultTone, 'win');

  const flipped = duelResult();
  flipped.participants = flipped.participants.map((row) => ({
    ...row,
    resultTone: null,
    rank: row.isMe ? 2 : 1,
  }));
  const reconciledLose = reconcileDuelRunDetailMatchResultFromResult({
    matchResult: pendingDuelBlob,
    result: flipped,
  });
  assert.equal(reconciledLose?.resultTone, 'lose');
  assert.equal(reconciledLose?.badgeLabel, '패배');
});

test('§3-⑦: a resolved/forfeit saved record is never overwritten by the /result fallback', () => {
  const complete: RunMatchResult = {
    ...pendingDuelBlob,
    resultTone: 'lose',
    badgeLabel: '패배',
    opponentDurationSeconds: 1400,
    opponentPaceLabel: '4:40/km',
  };
  assert.equal(
    reconcileDuelRunDetailMatchResultFromResult({ matchResult: complete, result: duelResult() }),
    null,
  );

  const forfeit: RunMatchResult = {
    ...pendingDuelBlob,
    badgeLabel: '기권 패',
    resultTone: 'lose',
  };
  assert.equal(
    reconcileDuelRunDetailMatchResultFromResult({ matchResult: forfeit, result: duelResult() }),
    null,
  );
});

test('§3-⑦: matchId mismatch or missing MY row → no reconciliation (stays pending)', () => {
  assert.equal(
    reconcileDuelRunDetailMatchResultFromResult({
      matchResult: pendingDuelBlob,
      result: duelResult({ matchId: 'other-match' }),
    }),
    null,
  );

  const noMeResult = duelResult();
  noMeResult.participants = noMeResult.participants.map((row) => ({ ...row, isMe: false }));
  assert.equal(
    reconcileDuelRunDetailMatchResultFromResult({ matchResult: pendingDuelBlob, result: noMeResult }),
    null,
  );
});

test('§3-⑨: /result provisional/revised flags pass through onto the overlay (display-only)', () => {
  const provisionalReconciled = reconcileDuelRunDetailMatchResultFromResult({
    matchResult: pendingDuelBlob,
    result: duelResult({ provisional: true }),
  });
  assert.equal(provisionalReconciled?.provisional, true);
  assert.equal(provisionalReconciled?.revised, undefined);

  const revisedReconciled = reconcileDuelRunDetailMatchResultFromResult({
    matchResult: pendingDuelBlob,
    result: duelResult({ revised: true }),
  });
  assert.equal(revisedReconciled?.revised, true);
});

test('§3-⑨: /status verdict provisional/revised flags pass through onto the overlay', () => {
  const pending: RunMatchResult = { ...pendingDuelBlob };
  const provisionalVerdict: DuelVerdict = { ...resolvedWinVerdict, provisional: true };
  const provisionalReconciled = reconcileDuelRunDetailMatchResult({
    matchResult: pending,
    status: duelStatus(provisionalVerdict),
  });
  assert.equal(provisionalReconciled?.provisional, true);
  assert.equal(provisionalReconciled?.resultTone, 'win');

  const revisedVerdict: DuelVerdict = { ...resolvedWinVerdict, revised: true };
  const revisedReconciled = reconcileDuelRunDetailMatchResult({
    matchResult: pending,
    status: duelStatus(revisedVerdict),
  });
  assert.equal(revisedReconciled?.revised, true);
});

function groupResult(overrides: Partial<MatchResultResponse> = {}): MatchResultResponse {
  return {
    matchId: 'g1',
    mode: 'group',
    source: 'official',
    comparedDistanceKm: 5,
    participants: [
      {
        userId: 'leader',
        name: '1등',
        districtName: null,
        provinceName: null,
        cityName: null,
        paceSecondsPerKm: 300,
        finishElapsedSeconds: 1500,
        distanceKm: 5,
        rank: 1,
        resultTone: null,
        forfeited: false,
        isMe: false,
      },
      {
        userId: 'me',
        name: '나',
        districtName: null,
        provinceName: null,
        cityName: null,
        paceSecondsPerKm: 312,
        finishElapsedSeconds: 1560,
        distanceKm: 5,
        rank: 2,
        resultTone: null,
        forfeited: false,
        isMe: true,
      },
      {
        userId: 'third',
        name: '3등',
        districtName: null,
        provinceName: null,
        cityName: null,
        paceSecondsPerKm: 324,
        finishElapsedSeconds: 1620,
        distanceKm: 5,
        rank: 3,
        resultTone: null,
        forfeited: false,
        isMe: false,
      },
    ],
    ...overrides,
  };
}

test('§3-⑦ group parity: a PENDING group record reconciles its placement from MY /result row', () => {
  const pending: RunMatchResult = {
    mode: 'group',
    matchId: 'g1',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
    myDurationSeconds: 1560,
  };

  const reconciled = reconcileGroupRunDetailMatchResultFromResult({
    matchResult: pending,
    result: groupResult({ provisional: true }),
  });

  assert.ok(reconciled);
  assert.equal(reconciled?.rank, 2);
  assert.equal(reconciled?.badgeLabel, '2위');
  assert.match(reconciled?.title ?? '', /2위/);
  assert.equal(reconciled?.myDurationSeconds, 1560);
  assert.equal(reconciled?.provisional, true);
});

test('§3-⑦ group parity: a ranked group record is never overwritten; a rank-less MY row stays pending', () => {
  const ranked: RunMatchResult = {
    mode: 'group',
    matchId: 'g1',
    title: '3명 중 2위로 마쳤어요',
    summary: '',
    badgeLabel: '2위',
    rank: 2,
    participantCount: 3,
  };
  assert.equal(
    reconcileGroupRunDetailMatchResultFromResult({ matchResult: ranked, result: groupResult() }),
    null,
  );

  const pending: RunMatchResult = {
    mode: 'group',
    matchId: 'g1',
    title: '그룹 결과를 집계하고 있어요',
    summary: '',
    badgeLabel: '결과 집계 중',
    participantCount: 3,
  };
  const unranked = groupResult();
  unranked.participants = unranked.participants.map((row) => (
    row.isMe ? { ...row, rank: null } : row
  ));
  assert.equal(
    reconcileGroupRunDetailMatchResultFromResult({ matchResult: pending, result: unranked }),
    null,
  );
});

// ---------------------------------------------------------------------------
// §3-⑦ terminal handling: 410 match_gone OR (>24h-old pending blob AND 404) → the
// neutral "결과 미확정으로 종료" state; 집계 중 can never stick forever.
// ---------------------------------------------------------------------------

test('§3-⑦ terminal: 410 match_gone terminalizes regardless of age; a young 404 stays pending', () => {
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({ matchGone: true, notFound: false, pendingAgeMs: 0 }),
    true,
  );
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({ matchGone: true, notFound: false, pendingAgeMs: null }),
    true,
  );
  // A 404 on a young pending record: the seal/backfill may still land — stay pending.
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({
      matchGone: false,
      notFound: true,
      pendingAgeMs: 60 * 60 * 1000,
    }),
    false,
  );
  // A 404 on a >24h-old pending record: nothing left server-side to heal from — terminal.
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({
      matchGone: false,
      notFound: true,
      pendingAgeMs: MATCH_RESULT_PENDING_TERMINAL_AGE_MS + 1,
    }),
    true,
  );
  // Unknown record age can never terminalize a plain 404.
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({ matchGone: false, notFound: true, pendingAgeMs: null }),
    false,
  );
  // No terminal signal at all (network error path) → stay pending.
  assert.equal(
    shouldTerminalizeUnresolvedMatchResult({
      matchGone: false,
      notFound: false,
      pendingAgeMs: MATCH_RESULT_PENDING_TERMINAL_AGE_MS * 2,
    }),
    false,
  );
});

test('§3-⑦ terminal: buildUnresolvedTerminalMatchResult yields a NEUTRAL record (no tone/rank, 미확정 copy)', () => {
  const terminal = buildUnresolvedTerminalMatchResult({
    ...pendingDuelBlob,
    provisional: true,
  });
  assert.equal(terminal.title, '결과 미확정으로 종료');
  assert.equal(terminal.badgeLabel, '결과 미확정');
  assert.equal(terminal.resultTone, undefined);
  assert.equal(terminal.rank, undefined);
  assert.equal(terminal.gapKm, undefined);
  assert.equal(terminal.provisional, undefined);
  assert.equal(terminal.revised, undefined);
  // The run's own numbers are kept — only the verdict promise is replaced.
  assert.equal(terminal.myDurationSeconds, 1500);
  assert.equal(terminal.matchId, 'm1');
  assert.equal(terminal.mode, 'duel');
});
