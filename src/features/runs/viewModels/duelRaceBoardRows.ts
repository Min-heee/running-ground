import {
  buildRaceBoardSubtitle,
  sortProgressiveRaceRows,
} from '@/features/runs/viewModels/liveMatchRaceBoardProgressive';
import { resolveParticipantDisplayDistanceKm } from '@/features/runs/viewModels/matchProgress';
import type { LiveMatchRaceBoardViewModel, LiveMatchRaceBoardViewModelInput } from './liveMatchRaceBoardViewModel';
import { buildDuelParticipantFirstRows } from './duelParticipantRaceBoardRows';
import { traceRaceBoardRows } from './raceBoardTrace';

type DuelRaceBoardSectionInput = Pick<
  LiveMatchRaceBoardViewModelInput,
  | 'currentUserDuelLiveStatus'
  | 'currentUserDuelResultLabel'
  | 'currentUserName'
  | 'distanceKm'
  | 'duelDistanceKm'
  | 'effectiveDuelOpponent'
  | 'opponentDuelResultLabel'
  | 'roomLinkedDuelPlaceholderParticipants'
  | 'syncedDuelDistanceKm'
  | 'syncedDuelOpponentDistanceKm'
  | 'visibleMatchRoom'
>;

export function buildDuelRaceBoardSection({
  currentUserDuelLiveStatus,
  currentUserDuelResultLabel,
  currentUserName,
  distanceKm,
  duelDistanceKm,
  effectiveDuelOpponent,
  opponentDuelResultLabel,
  roomLinkedDuelPlaceholderParticipants,
  syncedDuelDistanceKm,
  syncedDuelOpponentDistanceKm,
  visibleMatchRoom,
}: DuelRaceBoardSectionInput): LiveMatchRaceBoardViewModel {
  if (visibleMatchRoom?.mode === 'duel' && visibleMatchRoom.participants.length >= 2) {
    const placeholderDistanceKm = visibleMatchRoom.linkedMatchDistanceKm ?? visibleMatchRoom.distanceKm ?? duelDistanceKm;
    const progressiveRows = buildDuelParticipantFirstRows({
      currentUserDuelLiveStatus,
      currentUserDuelResultLabel,
      distanceKm,
      effectiveDuelOpponent,
      opponentDuelResultLabel,
      room: visibleMatchRoom,
      syncedDuelDistanceKm,
      syncedDuelOpponentDistanceKm,
      targetDistanceKm: placeholderDistanceKm,
    });
    const rows = progressiveRows.rows;
    traceRaceBoardRows({ matchMode: 'duel', rows, source: 'visible room participant-first' });

    return {
      title: '1대1 레이스 보드',
      subtitle: buildRaceBoardSubtitle({
        // The 1:1 raceBoard description was removed; only the partial-progressive
        // subtitle (when rows are hidden) or the sync-in-progress message remain.
        fallback: effectiveDuelOpponent
          ? ''
          : '대결 정보를 맞추는 중에도 같은 방의 상대를 함께 표시해요.',
        progressiveRows,
      }),
      rows,
    };
  }

  if (effectiveDuelOpponent) {
    // HEAD-TO-HEAD FAIRNESS: both race-board rows sit on the SAME latest-common-checkpoint
    // basis served by the backend — my row uses syncedDuelDistanceKm and the opponent row
    // uses syncedDuelOpponentDistanceKm. Both are the server-fed comparison values computed
    // at one identical checkpoint time, so the two rows (and the 남은거리 derived from them)
    // are apples-to-apples. This supersedes the earlier "live-both-sides" workaround, which
    // was only needed because the old checkpoint step was a coarse 30s that froze the
    // opponent while my live row climbed; the backend now buckets at 10s and both sides are
    // symmetric, so the gap can no longer inflate-then-snap.
    //
    // Anti-0.00 guard preserved: syncedDuelDistanceKm falls back to my live `distanceKm`
    // when no comparison snapshot exists yet, and the opponent value falls back to the
    // opponent's live display distance (resolveParticipantDisplayDistanceKm) if the synced
    // value is missing (<= 0), so neither row flickers to a fake 0.00 pre-sync.
    // The official WIN/LOSE result is server-determined (resultLabel below), untouched here.
    const currentBoardDistanceKm = syncedDuelDistanceKm > 0
      ? syncedDuelDistanceKm
      : distanceKm;
    const liveOpponentDistanceKm = resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm);
    const opponentBoardDistanceKm = syncedDuelOpponentDistanceKm > 0
      ? syncedDuelOpponentDistanceKm
      : liveOpponentDistanceKm;
    const progressiveRows = sortProgressiveRaceRows([
      {
        id: 'current-user',
        name: currentUserName?.trim() || '나',
        distanceKm: currentBoardDistanceKm,
        remainingKm: Math.max(0, duelDistanceKm - currentBoardDistanceKm),
        progress: duelDistanceKm > 0 ? currentBoardDistanceKm / duelDistanceKm : 0,
        isCurrentUser: true,
        liveStatus: currentUserDuelLiveStatus ?? undefined,
        resultLabel: currentUserDuelResultLabel ?? null,
      },
      {
        id: effectiveDuelOpponent.id,
        name: effectiveDuelOpponent.name || effectiveDuelOpponent.tag || '상대',
        distanceKm: opponentBoardDistanceKm,
        remainingKm: Math.max(0, duelDistanceKm - opponentBoardDistanceKm),
        progress: duelDistanceKm > 0 ? opponentBoardDistanceKm / duelDistanceKm : 0,
        isCurrentUser: false,
        liveStatus: effectiveDuelOpponent.liveStatus,
        resultLabel: opponentDuelResultLabel ?? null,
      },
    ], { hideRunningOthers: false });
    const rows = progressiveRows.rows;
    traceRaceBoardRows({ matchMode: 'duel', rows, source: 'duel opponent progress' });

    return {
      title: '1대1 레이스 보드',
      subtitle: buildRaceBoardSubtitle({
        // The 1:1 raceBoard description was removed; the partial-progressive
        // subtitle still surfaces when some rows are hidden.
        fallback: '',
        progressiveRows,
      }),
      rows,
    };
  }

  if (roomLinkedDuelPlaceholderParticipants.length === 2) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? duelDistanceKm;
    const progressiveRows = sortProgressiveRaceRows(roomLinkedDuelPlaceholderParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name || '상대',
      distanceKm: participant.distanceKm,
      remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
      progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
      resultLabel: participant.isCurrentUser
        ? currentUserDuelResultLabel ?? null
        : opponentDuelResultLabel ?? null,
    })), { hideRunningOthers: false });
    const rows = progressiveRows.rows;
    traceRaceBoardRows({ matchMode: 'duel', rows, source: 'room linked duel placeholder' });

    return {
      title: '1대1 레이스 보드',
      subtitle: buildRaceBoardSubtitle({
        fallback: '대결 정보를 맞추는 중에도 내 측정 거리와 상대 대기 상태를 볼 수 있어요.',
        progressiveRows,
      }),
      rows,
    };
  }

  return {
    title: '1대1 레이스 보드',
    subtitle: '대결 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요.',
    rows: [
      {
        id: 'current-user-fallback',
        rank: 1,
        name: currentUserName?.trim() || '나',
        distanceKm,
        remainingKm: Math.max(0, duelDistanceKm - distanceKm),
        progress: duelDistanceKm > 0 ? distanceKm / duelDistanceKm : 0,
        isCurrentUser: true,
        liveStatus: currentUserDuelLiveStatus ?? undefined,
        resultLabel: currentUserDuelResultLabel ?? null,
      },
    ],
  };
}
