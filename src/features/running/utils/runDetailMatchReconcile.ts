import type { RunMatchResult } from '@/domain';
import type {
  DuelVerdict,
  GroupVerdict,
  MatchResultParticipant,
  MatchResultResponse,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { formatPaceFromSecondsPerKm } from '@/features/runs/tracking';

// The server-side §B4 one-finisher fallback window (MATCH_DUEL_FINISH_FALLBACK_MS = 90s on the
// backend). A duel/group saved as PENDING heals server-side only AFTER this window elapses (the
// GET /result mutateStore seal + back-fill, or the periodic sweep). The client therefore must
// RETRY its reconcile past this window — an immediate-only reconcile ~1-2s post-finish always
// returns pending. A small buffer is added so the retry lands safely after the server has sealed.
export const MATCH_FINISH_FALLBACK_MS = 90 * 1000;
export const MATCH_RECONCILE_RETRY_MS = MATCH_FINISH_FALLBACK_MS + 5 * 1000;

// The minimal reconcile context a SAVED matchResult carries on its own — matchId + mode +
// the compared distance. This lets a record re-queried from 내 활동 / 기록 / 친구 (entry points
// that pass only { runId }, never the post-save match route params) STILL reconcile, because the
// gate no longer depends on route params. Returns null when the record cannot/should not be
// reconciled (no matchId, wrong/absent mode, already resolved, or a forfeit).
export function deriveSavedMatchReconcileContext(
  matchResult: RunMatchResult | null | undefined,
): { matchId: string; mode: 'duel' | 'group'; distanceKm: number } | null {
  if (!matchResult) {
    return null;
  }
  const matchId = typeof matchResult.matchId === 'string' ? matchResult.matchId.trim() : '';
  if (!matchId) {
    return null;
  }
  const mode = matchResult.mode === 'duel' || matchResult.mode === 'group' ? matchResult.mode : null;
  if (!mode) {
    return null;
  }
  const isUnresolved = mode === 'duel'
    ? isUnresolvedDuelMatchResult(matchResult)
    : isUnresolvedGroupMatchResult(matchResult);
  if (!isUnresolved) {
    return null;
  }
  // The compared distance is on the saved blob; fall back to a sentinel the backend treats
  // leniently when a matchId is present (the status route only needs the matchId to find it).
  const distanceKm = typeof matchResult.comparedDistanceKm === 'number'
    && Number.isFinite(matchResult.comparedDistanceKm)
    && matchResult.comparedDistanceKm > 0
    ? matchResult.comparedDistanceKm
    : 0;
  return { matchId, mode, distanceKm };
}

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
    // §3-⑨ display-only flags (additive server fields; absent on old backends → spread
    // nothing). Overlay-only — never persisted.
    ...(verdict.provisional === true ? { provisional: true } : {}),
    ...(verdict.revised === true ? { revised: true } : {}),
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
    // §3-⑨ display-only flag (additive server field; absent on old backends → spread
    // nothing). Overlay-only — never persisted.
    ...(verdict.provisional === true ? { provisional: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// §3-⑦ /result fallback: reconcile a PENDING saved matchResult against the by-matchId
// GET /result response. The /status reconcile above requires a LIVE session — after the
// session is pruned, /status answers idle-shaped and the pending record could stick on
// 집계 중 forever. /result deliberately reconstructs from SAVED runs too, so this path
// heals post-prune records even against the current prod backend. Overlay-only: callers
// surface the result via setReconciledMatchResult and never persist it.
// ---------------------------------------------------------------------------

function resolveResultPaceLabel(participant: MatchResultParticipant | null): string | null {
  if (
    !participant
    || typeof participant.paceSecondsPerKm !== 'number'
    || !Number.isFinite(participant.paceSecondsPerKm)
    || participant.paceSecondsPerKm <= 0
  ) {
    return null;
  }
  return formatPaceFromSecondsPerKm(participant.paceSecondsPerKm);
}

function resolveResultDurationSeconds(participant: MatchResultParticipant | null): number | null {
  if (
    !participant
    || typeof participant.finishElapsedSeconds !== 'number'
    || !Number.isFinite(participant.finishElapsedSeconds)
    || participant.finishElapsedSeconds <= 0
  ) {
    return null;
  }
  return Math.round(participant.finishElapsedSeconds);
}

// Display-only provisional/revised flags passed through from the server response. Absent
// on old backends → spread nothing (render nothing). Set ONLY on the overlay record.
function resolveResultOverlayFlags(result: MatchResultResponse): Pick<RunMatchResult, 'provisional' | 'revised'> {
  return {
    ...(result.provisional === true ? { provisional: true } : {}),
    ...(result.revised === true ? { revised: true } : {}),
  };
}

// Duel twin of reconcileDuelRunDetailMatchResult, sourced from the /result participant
// pair instead of the live-session verdict. My tone comes from MY participant row
// (resultTone, else rank order). Returns null when reconciliation is not warranted —
// the caller then stays on the as-saved (pending) record.
export function reconcileDuelRunDetailMatchResultFromResult({
  matchResult,
  result,
}: {
  matchResult: RunMatchResult | null | undefined;
  result: MatchResultResponse | null | undefined;
}): RunMatchResult | null {
  if (!matchResult || matchResult.mode !== 'duel') {
    return null;
  }
  if (!result || result.mode !== 'duel') {
    return null;
  }
  if (matchResult.matchId && result.matchId !== matchResult.matchId) {
    return null;
  }
  if (!isUnresolvedDuelMatchResult(matchResult)) {
    // Saved record already carries a full, definite result — do not overwrite it.
    return null;
  }

  const me = result.participants.find((participant) => participant.isMe) ?? null;
  const opponent = result.participants.find((participant) => !participant.isMe) ?? null;
  if (!me || !opponent) {
    return null;
  }

  const outcome: 'win' | 'lose' | 'draw' | null = me.resultTone
    ?? (typeof me.rank === 'number' && typeof opponent.rank === 'number'
      ? me.rank === opponent.rank ? 'draw' : me.rank < opponent.rank ? 'win' : 'lose'
      : null);
  if (!outcome) {
    return null;
  }

  const opponentName = matchResult.opponentName ?? (opponent.name || undefined);
  const myPaceLabel = resolveResultPaceLabel(me) ?? matchResult.myPaceLabel;
  const opponentPaceLabel = resolveResultPaceLabel(opponent) ?? matchResult.opponentPaceLabel;
  const myDurationSeconds = resolveResultDurationSeconds(me) ?? matchResult.myDurationSeconds;
  const opponentDurationSeconds = resolveResultDurationSeconds(opponent)
    ?? matchResult.opponentDurationSeconds;

  return {
    ...matchResult,
    resultTone: outcome,
    title: resolveVerdictTitle(outcome, opponentName),
    badgeLabel: resolveVerdictBadge(outcome),
    ...(opponentName ? { opponentName } : {}),
    ...(myPaceLabel ? { myPaceLabel } : {}),
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...(opponentPaceLabel ? { opponentPaceLabel } : {}),
    ...(typeof opponentDurationSeconds === 'number' ? { opponentDurationSeconds } : {}),
    ...resolveResultOverlayFlags(result),
  };
}

// Group twin of reconcileGroupRunDetailMatchResultFromResult's duel sibling — fills the
// official placement from my /result participant row. Returns null when not warranted.
export function reconcileGroupRunDetailMatchResultFromResult({
  matchResult,
  result,
}: {
  matchResult: RunMatchResult | null | undefined;
  result: MatchResultResponse | null | undefined;
}): RunMatchResult | null {
  if (!matchResult || matchResult.mode !== 'group') {
    return null;
  }
  if (!result || result.mode !== 'group') {
    return null;
  }
  if (matchResult.matchId && result.matchId !== matchResult.matchId) {
    return null;
  }
  if (!isUnresolvedGroupMatchResult(matchResult)) {
    // Saved record already carries a definite rank — do not overwrite it.
    return null;
  }

  const me = result.participants.find((participant) => participant.isMe) ?? null;
  if (!me || typeof me.rank !== 'number') {
    return null;
  }

  const rank = me.rank;
  const participantCount = typeof matchResult.participantCount === 'number'
    ? matchResult.participantCount
    : result.participants.length;
  const myPaceLabel = resolveResultPaceLabel(me) ?? matchResult.myPaceLabel;
  const myDurationSeconds = resolveResultDurationSeconds(me) ?? matchResult.myDurationSeconds;

  return {
    ...matchResult,
    rank,
    participantCount,
    title: resolveGroupTitle(rank, participantCount),
    badgeLabel: resolveGroupBadge(rank),
    ...(myPaceLabel ? { myPaceLabel } : {}),
    ...(typeof myDurationSeconds === 'number' ? { myDurationSeconds } : {}),
    ...resolveResultOverlayFlags(result),
  };
}

// ---------------------------------------------------------------------------
// §3-⑦ terminal handling: when the match can NEVER resolve anymore, the pending record
// must stop showing 집계 중 (which today can stick forever) and stop re-polling.
// ---------------------------------------------------------------------------

// A pending blob older than this that also gets a 404 from /result is unresolvable: the
// session is long pruned (4h TTL) AND no saved run backs a reconstruction — nothing left
// server-side to heal from.
export const MATCH_RESULT_PENDING_TERMINAL_AGE_MS = 24 * 60 * 60 * 1000;

// Decides whether an unresolved /result fetch is TERMINAL. matchGone (HTTP 410
// { code: 'match_gone' }) is terminal on its own; a plain 404 is terminal only when the
// pending record is older than 24h (a young 404 just means "not resolvable YET" — the
// seal/backfill may still land). Pure so the policy is unit-testable.
export function shouldTerminalizeUnresolvedMatchResult({
  matchGone,
  notFound,
  pendingAgeMs,
}: {
  matchGone: boolean;
  notFound: boolean;
  pendingAgeMs: number | null;
}): boolean {
  if (matchGone) {
    return true;
  }
  return notFound
    && typeof pendingAgeMs === 'number'
    && Number.isFinite(pendingAgeMs)
    && pendingAgeMs >= MATCH_RESULT_PENDING_TERMINAL_AGE_MS;
}

// The terminal NEUTRAL overlay: no win/lose/draw tone, no rank — the run itself stays, but
// the 집계 중 promise is replaced with an honest "결과 미확정으로 종료". Overlay-only; the
// persisted blob is never rewritten (never fabricate a persisted verdict).
export function buildUnresolvedTerminalMatchResult(
  matchResult: RunMatchResult,
): RunMatchResult {
  const {
    resultTone: _resultTone,
    rank: _rank,
    gapKm: _gapKm,
    provisional: _provisional,
    revised: _revised,
    ...rest
  } = matchResult;
  return {
    ...rest,
    title: '결과 미확정으로 종료',
    summary: '상대 기록을 끝까지 확인하지 못해 이 대결은 결과 없이 종료됐어요.',
    badgeLabel: '결과 미확정',
  };
}
