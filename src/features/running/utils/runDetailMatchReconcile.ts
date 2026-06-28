import type { RunMatchResult } from '@/domain';
import type { DuelVerdict, GroupVerdict, RunningMatchStatusResponse } from '@/lib/api/types';

// C3: reconcile a saved duel matchResult against the server's official duel record.
//
// When a duel is unresolved at save time (the runner finished first and saved before the
// opponent finished, or the terminal push was still pending), the as-saved matchResult holds
// a placeholder verdict / a possibly-local self time. Both phones must end up showing the
// SAME official times + verdict, so on the run-detail screen we re-query the official record
// and rebuild the matchResult from the server verdict — but only when doing so is an upgrade,
// never a downgrade of an already-good saved record.

function isResolvedDuelVerdict(verdict?: DuelVerdict | null): verdict is DuelVerdict {
  return Boolean(verdict && verdict.resolved && verdict.outcome !== 'pending');
}

// A saved duel record is "unresolved/placeholder" when it never captured a definite verdict.
// We only reconcile these — a record that already carries a definite win/lose/draw tone AND
// the user's own duration is considered good and left untouched (guard against downgrade).
export function isUnresolvedDuelMatchResult(matchResult: RunMatchResult | null | undefined): boolean {
  if (!matchResult || matchResult.mode !== 'duel') {
    return false;
  }
  // A forfeit record is terminal and authoritative locally — never reconcile it away.
  if (matchResult.badgeLabel === '기권 패' || matchResult.badgeLabel === '상대 기권 승') {
    return false;
  }
  const hasDefiniteTone = matchResult.resultTone === 'win'
    || matchResult.resultTone === 'lose'
    || matchResult.resultTone === 'draw';
  const hasSelfDuration = typeof matchResult.myDurationSeconds === 'number'
    && matchResult.myDurationSeconds > 0;
  const hasOpponentDuration = typeof matchResult.opponentDurationSeconds === 'number'
    && matchResult.opponentDurationSeconds > 0;
  // Unresolved if it is missing a definite tone, the self time, or the opponent time — any
  // of these means the saved card could not show the full final comparison.
  return !hasDefiniteTone || !hasSelfDuration || !hasOpponentDuration;
}

function resolveVerdictBadge(outcome: 'win' | 'lose' | 'draw'): string {
  switch (outcome) {
    case 'win':
      return '승리';
    case 'lose':
      return '패배';
    default:
      return '무승부';
  }
}

function resolveVerdictTitle(outcome: 'win' | 'lose' | 'draw', opponentName?: string): string {
  const name = opponentName ?? '상대';
  switch (outcome) {
    case 'win':
      return `${name}님을 이겼어요`;
    case 'lose':
      return `${name}님에게 졌어요`;
    default:
      return `${name}님과 비슷한 흐름으로 마쳤어요`;
  }
}

// Build the reconciled matchResult from the server verdict + the existing saved record.
// Returns null when reconciliation is not warranted (no resolved verdict, mode mismatch, or
// the saved record is already good). Never downgrades: only fills in the official times,
// pace and verdict the saved record was missing.
export function reconcileDuelRunDetailMatchResult({
  matchResult,
  status,
}: {
  matchResult: RunMatchResult | null | undefined;
  status: RunningMatchStatusResponse | null | undefined;
}): RunMatchResult | null {
  if (!matchResult || matchResult.mode !== 'duel') {
    return null;
  }
  if (!status || status.mode !== 'duel') {
    return null;
  }
  const verdict = status.duelVerdict;
  if (!isResolvedDuelVerdict(verdict)) {
    return null;
  }
  if (!isUnresolvedDuelMatchResult(matchResult)) {
    // Saved record already carries a full, definite result — do not overwrite it.
    return null;
  }

  // isResolvedDuelVerdict already excludes 'pending', so this is a definite tone.
  const outcome = verdict.outcome as 'win' | 'lose' | 'draw';
  const myDurationSeconds = typeof verdict.myFinishElapsedSeconds === 'number'
    && verdict.myFinishElapsedSeconds > 0
    ? Math.round(verdict.myFinishElapsedSeconds)
    : matchResult.myDurationSeconds;
  const opponentDurationSeconds = typeof verdict.opponentFinishElapsedSeconds === 'number'
    && verdict.opponentFinishElapsedSeconds > 0
    ? Math.round(verdict.opponentFinishElapsedSeconds)
    : matchResult.opponentDurationSeconds;
  const opponentName = matchResult.opponentName ?? status.opponent?.name;

  return {
    ...matchResult,
    resultTone: outcome,
    title: resolveVerdictTitle(outcome, opponentName),
    badgeLabel: resolveVerdictBadge(outcome),
    ...(verdict.myPaceLabel ? { myPaceLabel: verdict.myPaceLabel } : {}),
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...(verdict.opponentPaceLabel ? { opponentPaceLabel: verdict.opponentPaceLabel } : {}),
    ...(typeof opponentDurationSeconds === 'number' ? { opponentDurationSeconds } : {}),
  };
}

// ---------------------------------------------------------------------------
// Group parity: reconcile a saved GROUP matchResult against the server's official group verdict.
// The exact twin of the duel reconcile path above — when a group was UNRESOLVED at save time
// (the runner finished first and saved before the rest, so the placement could not be sealed),
// the as-saved matchResult carries NO rank (a PENDING placeholder). On the run-detail screen we
// re-query the official record and fill in the server-sealed placement — only as an upgrade,
// never a downgrade of an already-ranked saved record.
// ---------------------------------------------------------------------------

function isResolvedGroupVerdict(verdict?: GroupVerdict | null): verdict is GroupVerdict {
  return Boolean(verdict && verdict.resolved && typeof verdict.myRank === 'number');
}

// A saved group record is "unresolved/placeholder" when it never captured a definite placement.
// We only reconcile these — a record that already carries a rank is considered good and left
// untouched (guard against downgrade).
export function isUnresolvedGroupMatchResult(matchResult: RunMatchResult | null | undefined): boolean {
  if (!matchResult || matchResult.mode !== 'group') {
    return false;
  }
  // A forfeit record is terminal and authoritative locally — never reconcile it away.
  if (matchResult.badgeLabel === '기권') {
    return false;
  }
  // Unresolved if it is missing a definite rank — the saved card could not show a final placement.
  return typeof matchResult.rank !== 'number';
}

function resolveGroupBadge(rank: number): string {
  return `${rank}위`;
}

function resolveGroupTitle(rank: number, participantCount?: number): string {
  if (rank === 1) {
    return '1위로 마무리했어요';
  }
  return typeof participantCount === 'number' && participantCount > 0
    ? `${participantCount}명 중 ${rank}위로 마쳤어요`
    : `${rank}위로 마쳤어요`;
}

// Build the reconciled group matchResult from the server verdict + the existing saved record.
// Returns null when reconciliation is not warranted (no resolved verdict, mode mismatch, or the
// saved record already carries a rank). Never downgrades: only fills in the official placement
// the saved record was missing. Mirrors reconcileDuelRunDetailMatchResult.
export function reconcileGroupRunDetailMatchResult({
  matchResult,
  status,
}: {
  matchResult: RunMatchResult | null | undefined;
  status: RunningMatchStatusResponse | null | undefined;
}): RunMatchResult | null {
  if (!matchResult || matchResult.mode !== 'group') {
    return null;
  }
  if (!status || status.mode !== 'group') {
    return null;
  }
  const verdict = status.groupVerdict;
  if (!isResolvedGroupVerdict(verdict)) {
    return null;
  }
  if (!isUnresolvedGroupMatchResult(matchResult)) {
    // Saved record already carries a definite rank — do not overwrite it.
    return null;
  }

  const rank = verdict.myRank as number;
  const participantCount = typeof matchResult.participantCount === 'number'
    ? matchResult.participantCount
    : verdict.participants.length;
  const mine = verdict.participants.find((participant) => participant.rank === rank) ?? null;

  return {
    ...matchResult,
    rank,
    participantCount,
    title: resolveGroupTitle(rank, participantCount),
    badgeLabel: resolveGroupBadge(rank),
    ...(mine?.paceLabel ? { myPaceLabel: mine.paceLabel } : {}),
    ...(mine && typeof mine.finishElapsedSeconds === 'number' && mine.finishElapsedSeconds > 0
      ? { myDurationSeconds: Math.round(mine.finishElapsedSeconds) }
      : {}),
  };
}
