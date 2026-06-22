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
    // MY row always shows my LOCAL measured distance — never the server-echoed,
    // 30s-checkpoint-projected syncedDuelDistanceKm. It's my own data either way; the
    // server already gets the exact same number from my push, so there's no reason to
    // wait for it to echo back (quantized to a 30s checkpoint) before drawing my own
    // progress. This keeps my distance live and screen-state independent.
    //
    // The OPPONENT row mirrors this: it uses the opponent's freshest LIVE distance
    // (resolveParticipantDisplayDistanceKm, fed by liveDistanceKm and updated every
    // sync ~1-3s in foreground), NOT syncedDuelOpponentDistanceKm — which is the
    // 30s-checkpoint-projected comparison value. Using the 30s value froze the opponent
    // for ~30s while my live row kept climbing, so the displayed gap inflated to a full
    // 30s of running (~80-150m) and snapped back at each checkpoint, disagreeing with the
    // 기록/stats tab that compares both runners on the same instantaneous basis.
    //
    // Guard preserved: resolveParticipantDisplayDistanceKm returns the same value the
    // `duelLiveGapKm === null` branch already used, so when the opponent has no live
    // progress yet it stays whatever that resolver yields (no 0.00 flicker introduced).
    // We only fall back to syncedDuelOpponentDistanceKm when the live value is missing
    // (<= 0) but a synced checkpoint already exists, keeping the opponent visible.
    // The official result is computed server-side, so this estimate-only display change
    // is duel-fair.
    const currentBoardDistanceKm = distanceKm;
    const liveOpponentDistanceKm = resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm);
    const opponentBoardDistanceKm = liveOpponentDistanceKm > 0
      ? liveOpponentDistanceKm
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
