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
  | 'distanceKm'
  | 'duelDistanceKm'
  | 'duelLiveGapKm'
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
  distanceKm,
  duelDistanceKm,
  duelLiveGapKm,
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
      duelLiveGapKm,
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
        fallback: effectiveDuelOpponent
          ? '누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요.'
          : '대결 정보를 맞추는 중에도 같은 방의 상대를 함께 표시해요.',
        progressiveRows,
      }),
      rows,
    };
  }

  if (effectiveDuelOpponent) {
    const currentBoardDistanceKm = duelLiveGapKm === null ? distanceKm : syncedDuelDistanceKm;
    const opponentBoardDistanceKm = duelLiveGapKm === null
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
      : syncedDuelOpponentDistanceKm;
    const progressiveRows = sortProgressiveRaceRows([
      {
        id: 'current-user',
        name: '나',
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
        fallback: '누가 더 앞서 있는지, 각각 얼마 남았는지 한눈에 볼 수 있어요.',
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
        name: '나',
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
