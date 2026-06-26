import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunMatchResult } from '@/domain';
import type { DuelVerdict, RunningMatchStatusResponse } from '@/lib/api/types';
import {
  isUnresolvedDuelMatchResult,
  reconcileDuelRunDetailMatchResult,
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
