import {
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
  isMeasuredPaceLabel,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import {
  resolveDuelBadgeLabel,
  resolveDuelCurrentRowLabel,
  resolveDuelOpponentRowLabels,
  resolveDuelResultTone,
  resolveDuelRowOrder,
  resolveDuelSummary,
  resolveDuelTitle,
  resolveGroupRowLabels,
  resolveGroupStatusLabel,
  resolveGroupSummary,
  resolveGroupTitle,
} from '@/features/runs/viewModels/matchResultRowsPolicy';
import { formatDuration } from '@/features/runs/tracking';
import type {
  DuelMatchOpponent,
  DuelVerdict,
  GroupVerdict,
  RunningMatchLiveStatus,
} from '@/lib/api/types';
import type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
  MatchResultTone,
} from '@/features/runs/types/matchResult';

export type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
} from '@/features/runs/types/matchResult';

// Fair-verdict display copy (§3-⑨). Shared by the live arena result panel model here and
// the saved-record surfaces (RunMatchResultCard / MatchResultScreen) so the 가확정/정정
// language never diverges between the live card and the saved card.
export const MATCH_PROVISIONAL_NOTICE_LABEL = '가확정 · 상대 기록 수신 대기 중';
export const MATCH_REVISED_NOTICE_LABEL = '상대 기록이 지연 수신되어 결과가 정정됐어요';

// The duel verdict is the server's single source of truth, but only once it has actually
// RESOLVED. A `duelVerdict` whose `resolved` is false (outcome === 'pending') is still
// pending — the client must keep its local placeholders and never flip to a final 승/패.
// Likewise an ABSENT verdict (older backend that has not redeployed) falls through to the
// pure-local heuristics below, so deploy skew degrades gracefully instead of crashing or
// pinning the card on "pending" forever.
function isResolvedDuelVerdict(verdict?: DuelVerdict | null): verdict is DuelVerdict {
  return Boolean(verdict && verdict.resolved && verdict.outcome !== 'pending');
}

export function buildDuelMatchFinishModel({
  opponent,
  currentDistanceKm,
  targetDistanceKm,
  currentElapsedSeconds,
  currentPaceLabel,
  currentUserLiveStatus,
  duelVerdict,
  currentUserFinishElapsedSeconds,
  matchId,
}: {
  opponent: DuelMatchOpponent | null;
  currentDistanceKm: number;
  targetDistanceKm: number;
  currentElapsedSeconds: number;
  currentPaceLabel: string;
  currentUserLiveStatus?: RunningMatchLiveStatus | null;
  duelVerdict?: DuelVerdict | null;
  currentUserFinishElapsedSeconds?: number | null;
  // C1: the originating matchId. Its PRESENCE marks this as a real server-tracked duel whose
  // win/lose is server-authoritative — so when the server verdict is not yet resolved we must
  // NOT invent a distance-based winner (the screen-off "always win" bug). Absent (a synthetic/
  // legacy local-only duel with no server session) keeps the old local heuristic untouched.
  matchId?: string | null;
}): DuelMatchFinishModel | null {
  if (!opponent) {
    return null;
  }

  const isRealMatch = typeof matchId === 'string' && matchId.trim().length > 0;
  const currentForfeited = currentUserLiveStatus === 'forfeited';
  const currentFinished = currentUserLiveStatus === 'finished';
  const opponentForfeited = opponent.liveStatus === 'forfeited';
  const opponentFinished = opponent.liveStatus === 'finished';
  const opponentInProgress = currentFinished && !opponentForfeited && !opponentFinished;
  const opponentHasProgress = hasRemoteRunnerProgress(opponent);
  const opponentDistanceKm = opponentForfeited || opponentHasProgress
    ? resolveParticipantDisplayDistanceKm(opponent, targetDistanceKm)
    : 0;
  const gapKm = Number(Math.abs(currentDistanceKm - opponentDistanceKm).toFixed(2));

  // C2: when the server has RESOLVED the duel, its verdict — not the local distance/finish
  // -order heuristic — decides win/lose/draw. A forfeit still wins/loses by the forfeit
  // rules (the verdict's outcome already reflects forfeits), but we keep the local forfeit
  // copy/labels below so the "기권" UX is unchanged.
  const verdictResolved = isResolvedDuelVerdict(duelVerdict);
  const verdictResultTone: MatchResultTone | null = verdictResolved
    ? (duelVerdict.outcome as MatchResultTone)
    : null;

  // Self finish time/pace come from the server when it has frozen them (so both phones show
  // the SAME official numbers). Fall back to the local frozen values only when the server
  // has not provided them yet (deploy skew / pre-finish).
  const hasServerSelfFinish = verdictResolved
    && typeof duelVerdict.myFinishElapsedSeconds === 'number'
    && Number.isFinite(duelVerdict.myFinishElapsedSeconds);
  const resolvedCurrentElapsedSeconds = hasServerSelfFinish
    ? duelVerdict.myFinishElapsedSeconds!
    : typeof currentUserFinishElapsedSeconds === 'number' && Number.isFinite(currentUserFinishElapsedSeconds)
      ? currentUserFinishElapsedSeconds
      : currentElapsedSeconds;
  const resolvedCurrentPaceLabel = hasServerSelfFinish && isMeasuredPaceLabel(duelVerdict.myPaceLabel)
    ? duelVerdict.myPaceLabel!
    : currentPaceLabel;

  // Opponent finish time/pace from the verdict when resolved + present.
  const hasServerOpponentFinish = verdictResolved
    && typeof duelVerdict.opponentFinishElapsedSeconds === 'number'
    && Number.isFinite(duelVerdict.opponentFinishElapsedSeconds);
  const serverOpponentPaceLabel = verdictResolved && isMeasuredPaceLabel(duelVerdict.opponentPaceLabel)
    ? duelVerdict.opponentPaceLabel!
    : null;

  const bothOfficiallyFinished = currentFinished && opponentFinished && !currentForfeited && !opponentForfeited;
  const officialResultTone: MatchResultTone | null = bothOfficiallyFinished
    && typeof opponent.officialRank === 'number'
    && Number.isFinite(opponent.officialRank)
    ? (opponent.officialRank === 1 ? 'lose' : 'win')
    : null;

  // C1: PENDING. For a real server-tracked match (matchId present) the win/lose is
  // server-authoritative. When the server verdict has not resolved AND there is no other
  // legitimate local basis for a definite result — no forfeit on either side, the opponent is
  // not still in-progress (the "내가 먼저 완주" UX), and we have no official both-finished rank —
  // we must NOT invent a winner. The only thing the old code could do here was the distance-
  // based `resolveDuelResultTone` heuristic, which on a screen-off opponent (opponentDistanceKm
  // falls to 0) always returned 'win'. That is the BUG: both phones wrote themselves a win.
  //
  // Instead we mark the result PENDING: the persisted matchResult carries NO resultTone (so the
  // backend awards no +20P and the saved card shows a "결과 집계 중" state), and the run-detail
  // reconcile path fills the official verdict on a later fetch.
  const isPending = isRealMatch
    && !verdictResolved
    && !officialResultTone
    && !currentForfeited
    && !opponentForfeited
    && !opponentInProgress;

  // Draw: server outcome wins when resolved; otherwise keep the local near-equal heuristic.
  // A pending result is never a draw.
  const isDraw = verdictResolved
    ? duelVerdict.outcome === 'draw'
    : officialResultTone
      ? false
      : !isPending && !currentForfeited && !opponentForfeited && !opponentInProgress && gapKm < 0.03;
  // The DISPLAY tone for the live arena card. For a pending result we keep a neutral 'win'-free
  // placeholder by deferring to the in-progress copy; the PERSISTED matchResult below strips the
  // tone entirely so nothing definite is saved.
  const resultTone: MatchResultTone = verdictResultTone ?? officialResultTone ?? (isPending
    ? 'draw'
    : resolveDuelResultTone({
      currentForfeited,
      opponentForfeited,
      opponentInProgress,
      isDraw,
      currentDistanceKm,
      opponentDistanceKm,
    }));
  // C1: pending copy is the same "결과 집계 중" language the backend pending record uses, so the
  // live card and the saved card read identically while the official verdict is awaited.
  const title = isPending
    ? '대결 결과를 집계하고 있어요'
    : resolveDuelTitle({
      opponentName: opponent.name,
      currentForfeited,
      opponentForfeited,
      opponentInProgress,
      isDraw,
      resultTone,
    });
  const summary = isPending
    ? '상대가 완주하면 결과가 자동으로 업데이트돼요.'
    : resolveDuelSummary({
      currentForfeited,
      opponentForfeited,
      opponentInProgress,
      isDraw,
      resultTone,
      currentDistanceKm,
      gapKm,
    });
  const badgeLabel = isPending
    ? '결과 집계 중'
    : resolveDuelBadgeLabel({
      currentForfeited,
      opponentForfeited,
      isDraw,
      resultTone,
    });
  // Opponent finish elapsed: prefer the server's frozen value once resolved (keeps both
  // phones identical), then their live elapsed, then the forfeit-zero / current fallback.
  // The forfeit branch is untouched so "기권"/"00:00" still render exactly as before.
  const opponentElapsedSeconds = opponentForfeited
    ? (opponent.liveElapsedSeconds ?? 0)
    : hasServerOpponentFinish
      ? duelVerdict.opponentFinishElapsedSeconds!
      : (opponent.liveElapsedSeconds ?? currentElapsedSeconds);
  const opponentHasLiveElapsed = hasServerOpponentFinish
    || (typeof opponent.liveElapsedSeconds === 'number'
      && Number.isFinite(opponent.liveElapsedSeconds)
      && opponent.liveElapsedSeconds > 0);
  const resolvedOpponentPace = !opponentForfeited && serverOpponentPaceLabel
    ? serverOpponentPaceLabel
    : buildParticipantAveragePaceLabel(opponent, true);
  const opponentPace = opponentForfeited && !isMeasuredPaceLabel(resolvedOpponentPace)
    ? '기권'
    : resolvedOpponentPace;
  const currentRow: DuelMatchResultRowModel = {
    id: 'me',
    // C1: a pending result shows the in-progress label, never a WIN/LOSER/DRAW, so the live
    // card never claims a definite verdict before the server resolves one.
    resultLabel: isPending ? 'ING' : resolveDuelCurrentRowLabel({ isDraw, resultTone, currentForfeited }),
    name: '나',
    // C4: the 나 column pace + duration come from the SAME finish elapsed/distance the
    // server froze (when resolved), so the result card 나 pace and the bottom metric pace
    // never diverge (the 6:17-vs-6:14 bug).
    paceLabel: resolvedCurrentPaceLabel,
    durationLabel: formatDuration(resolvedCurrentElapsedSeconds),
    distanceKm: currentDistanceKm,
    isCurrentUser: true,
  };
  // C1: a pending opponent row reuses the in-progress presentation ("진행 중" / "-"), so the
  // opponent column never shows a fabricated WIN/LOSE or a guessed time before the verdict lands.
  const opponentRowInProgress = isPending || opponentInProgress;
  const opponentRowLabels = resolveDuelOpponentRowLabels({
    opponentInProgress: opponentRowInProgress,
    isDraw,
    resultTone,
    opponentForfeited,
    opponentPaceLabel: opponentPace,
    opponentDurationLabel: formatDuration(opponentElapsedSeconds),
    opponentHasLiveProgress: opponentHasLiveElapsed,
  });
  const opponentRow: DuelMatchResultRowModel = {
    id: opponent.id,
    resultLabel: opponentRowLabels.resultLabel,
    name: opponent.name,
    paceLabel: opponentRowLabels.paceLabel,
    durationLabel: opponentRowLabels.durationLabel,
    distanceKm: opponentDistanceKm,
    isCurrentUser: false,
    isInProgress: opponentRowInProgress,
  };
  const rows = resolveDuelRowOrder({
    currentRow,
    opponentRow,
    opponentInProgress: opponentRowInProgress,
    isDraw,
  });

  // §3-⑨ fair-verdict notices — ADDITIVE server flags; both absent on an old backend, so
  // nothing renders then. Display-only (kept OFF matchResult): the persisted blob must never
  // carry a provisional outcome — write-once heal semantics stay intact.
  const provisionalNoticeLabel = verdictResolved && duelVerdict.provisional === true
    ? MATCH_PROVISIONAL_NOTICE_LABEL
    : null;
  const revisedNoticeLabel = verdictResolved && duelVerdict.revised === true
    ? MATCH_REVISED_NOTICE_LABEL
    : null;

  return {
    title,
    summary,
    resultTone,
    badgeLabel,
    opponentDistanceKm,
    gapKm,
    rows,
    provisionalNoticeLabel,
    revisedNoticeLabel,
    matchResult: {
      mode: 'duel',
      title,
      summary,
      badgeLabel,
      opponentId: opponent.id,
      opponentName: opponent.name,
      // C1: a PENDING result persists NO win/lose. Stripping resultTone means the backend
      // awards no +20P from this device's claim, the saved card shows the "결과 집계 중" state,
      // and isUnresolvedDuelMatchResult treats it as reconcilable so the official verdict fills
      // it in later. We also drop the gap and any opponent finish numbers, which are meaningless
      // until the verdict resolves. (Note: even though the backend now re-resolves the verdict at
      // save, persisting a clean pending blob here keeps the client honest in deploy-skew where
      // an older backend has not redeployed.)
      ...(isPending ? {} : { resultTone, gapKm }),
      comparedDistanceKm: opponentDistanceKm,
      // C4: persist the SAME pace the 나 column shows (server-frozen when resolved).
      myPaceLabel: resolvedCurrentPaceLabel,
      // Durations must be whole seconds — the backend validates them as positive
      // integers, so a raw float elapsed (esp. the opponent's synced liveElapsed)
      // would 400 the whole run save and strand the runner on the live screen.
      myDurationSeconds: Math.round(resolvedCurrentElapsedSeconds),
      // Persist the opponent's pace/time only when it is genuinely theirs: a measured
      // pace, and an elapsed that actually came from their live sync. The previous code
      // stored a '--:--/km' placeholder, and — when their progress had not synced —
      // silently saved MY elapsed (the `?? currentElapsedSeconds` fallback) as the
      // opponent's. Omitting instead means the saved 대결 카드 shows nothing for the
      // opponent rather than a wrong value when their live data is missing. A pending
      // result never persists an opponent time (we have no verified one yet).
      ...(!isPending && isMeasuredPaceLabel(opponentPace) ? { opponentPaceLabel: opponentPace } : {}),
      ...(!isPending && opponentHasLiveElapsed
        ? { opponentDurationSeconds: Math.round(opponentElapsedSeconds) }
        : {}),
    },
  };
}

// The group verdict is the server's single source of truth for the FINAL placement, but only
// once it has actually RESOLVED. A `groupVerdict` whose `resolved` is false is still settling —
// the client must keep its PENDING placeholder and never flip to a final 순위. Likewise an
// ABSENT verdict (older backend that has not redeployed) falls through to the pure-local
// standings below, so deploy skew degrades gracefully instead of crashing or pinning the card
// on "pending" forever. Mirrors isResolvedDuelVerdict.
function isResolvedGroupVerdict(verdict?: GroupVerdict | null): verdict is GroupVerdict {
  return Boolean(verdict && verdict.resolved && typeof verdict.myRank === 'number');
}

export function buildGroupMatchFinishModel({
  currentStanding,
  participantCount,
  standings,
  currentPaceLabel,
  currentElapsedSeconds,
  groupVerdict,
  matchId,
}: {
  currentStanding: GroupLiveStanding | null;
  participantCount: number;
  standings: GroupLiveStanding[];
  currentPaceLabel: string;
  currentElapsedSeconds: number;
  targetDistanceKm: number;
  // C (group parity): server-authoritative group placement. Optional/absent on older backends —
  // the model degrades to today's local behavior then.
  groupVerdict?: GroupVerdict | null;
  // C (group parity): the active match id. Its PRESENCE marks this as a real server-tracked group
  // whose placement is server-authoritative — so when the server verdict is not yet resolved we
  // must NOT persist a fabricated local rank (the screen-off "wrong placement" bug). Absent (a
  // synthetic/legacy local-only group with no server session) keeps the old local heuristic.
  matchId?: string | null;
}): GroupMatchFinishModel | null {
  if (!currentStanding || !participantCount) {
    return null;
  }

  const isRealMatch = typeof matchId === 'string' && matchId.trim().length > 0;
  const currentForfeited = currentStanding.liveStatus === 'forfeited' || currentStanding.isForfeited;

  // C (group parity): when the server has RESOLVED the group, its verdict — not the local
  // standings rank — decides the persisted final placement. A forfeit still resolves by the
  // forfeit rules (the verdict already ranks forfeiters below finishers), and we keep the local
  // forfeit copy/labels so the "기권" UX is unchanged.
  const verdictResolved = isResolvedGroupVerdict(groupVerdict);
  // The server-sealed placement for the current user (only when resolved).
  const verdictRank = verdictResolved ? groupVerdict.myRank! : null;

  // C (group parity): PENDING. For a real server-tracked match (matchId present) the placement is
  // server-authoritative. When the server verdict has not resolved AND there is no other legitimate
  // local basis for a definite placement — the user did not forfeit, and at least one participant is
  // still in progress (so the ordering can still change) — we must NOT persist a fabricated rank.
  // The local standings rank on a screen-off / not-yet-synced rival is exactly the wrong-placement
  // bug. Instead we mark the result PENDING: the persisted matchResult carries NO rank (so the
  // backend awards no rank LP and the saved card shows a "결과 집계 중" state), and the run-detail
  // reconcile path fills the official placement on a later fetch.
  const hasOngoingStandings = standings.some((participant) => (
    participant.liveStatus !== 'finished' && participant.liveStatus !== 'forfeited'
  ));
  const isPending = isRealMatch
    && !verdictResolved
    && !currentForfeited
    && hasOngoingStandings;

  // The DISPLAY rank for the result card: the server-sealed rank when resolved, else the local
  // standings rank (used only for the non-pending copy below).
  const displayRank = verdictRank ?? currentStanding.rank;

  const title = isPending
    ? '그룹 결과를 집계하고 있어요'
    : resolveGroupTitle({
      currentForfeited,
      currentRank: displayRank,
      participantCount,
    });
  const summary = isPending
    ? '다른 참가자가 완주하면 순위가 자동으로 업데이트돼요.'
    : resolveGroupSummary({
      currentForfeited,
      currentRank: displayRank,
      participantCount,
      gapAheadKm: currentStanding.gapAheadKm,
    });
  const podium = standings.slice(0, 3);
  const rows: GroupMatchResultRowModel[] = standings.map((participant) => {
    const isInProgress = participant.liveStatus !== 'finished' && participant.liveStatus !== 'forfeited';
    const participantHasLiveElapsed = typeof participant.liveElapsedSeconds === 'number'
      && Number.isFinite(participant.liveElapsedSeconds)
      && participant.liveElapsedSeconds > 0;
    const participantPaceLabel = buildParticipantAveragePaceLabel(participant, true);
    const rowLabels = resolveGroupRowLabels({
      isInProgress,
      isCurrentUser: participant.isCurrentUser,
      currentPaceLabel,
      participantPaceLabel: participant.liveStatus === 'forfeited' && !isMeasuredPaceLabel(participantPaceLabel)
        ? '기권'
        : participantPaceLabel,
      durationLabel: formatDuration(
        participant.liveStatus === 'forfeited'
          ? (participant.liveElapsedSeconds ?? 0)
          : (participant.liveElapsedSeconds ?? currentElapsedSeconds),
      ),
      participantHasLiveProgress: participantHasLiveElapsed,
    });

    return {
      id: participant.id,
      rank: participant.rank,
      name: participant.isCurrentUser ? '나' : participant.name,
      paceLabel: rowLabels.paceLabel,
      durationLabel: rowLabels.durationLabel,
      distanceKm: participant.currentDistanceKm,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus as RunningMatchLiveStatus | undefined,
      isInProgress: rowLabels.isInProgress,
    };
  });
  const hasOngoingParticipants = rows.some((participant) => participant.isInProgress);

  // C (group parity): pending badge is the same "결과 집계 중" language the backend pending record
  // uses, so the live card and the saved card read identically while the official placement is
  // awaited. A forfeit keeps its 기권 badge; otherwise the badge shows the server-sealed (or, for a
  // legacy/non-real match, the local) rank.
  const badgeLabel = isPending
    ? '결과 집계 중'
    : currentForfeited
      ? '기권'
      : `${displayRank}위`;

  return {
    title,
    summary,
    podium,
    rows,
    statusLabel: resolveGroupStatusLabel({
      hasRows: rows.length > 0,
      hasOngoing: hasOngoingParticipants,
    }),
    // §3-⑨ fair-verdict notice — additive server flag; absent on an old backend → renders
    // nothing. Display-only, kept OFF the persisted matchResult (see duel twin above).
    provisionalNoticeLabel: verdictResolved && groupVerdict.provisional === true
      ? MATCH_PROVISIONAL_NOTICE_LABEL
      : null,
    matchResult: {
      mode: 'group',
      title,
      summary,
      badgeLabel,
      // C (group parity): a PENDING result persists NO rank. Stripping rank means the backend
      // awards no rank LP from this device's claim, the saved card shows the "결과 집계 중" state,
      // and isUnresolvedGroupMatchResult treats it as reconcilable so the official placement fills
      // it in later. When resolved we persist the SERVER-sealed rank (never the local standings
      // rank); when absent (older backend) we fall back to the local standings rank as before.
      ...(isPending ? {} : { rank: displayRank, gapKm: currentStanding.gapAheadKm ?? undefined }),
      participantCount,
    },
  };
}
