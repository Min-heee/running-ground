import type { Dispatch, SetStateAction } from 'react';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { FocusRunningMatchInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import { confirmUpcomingMatchCancel } from '@/features/runs/components/confirmUpcomingMatchCancel';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { ensureCompetitivePreflight } from '@/features/runs/permissions/ensureCompetitivePreflight';
import { useStableCallback } from '@/features/runs/runtime/useStableCallback';
import type {
  RunningMatchRoom,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunIdlePressHandlersInput = {
  activeDuelSlotStartAt: string;
  activeGroupSlotStartAt: string;
  focusRunningMatch: (input: FocusRunningMatchInput) => Promise<unknown>;
  handleAcceptRoomInviteFromRunning: () => Promise<unknown>;
  handleCancelDuelMatch: () => Promise<unknown>;
  handleCancelGroupMatch: () => Promise<unknown>;
  handleCancelUpcomingMatch: (match: UpcomingRunningMatchItem) => Promise<unknown>;
  handleDeclineRoomInviteFromRunning: () => Promise<unknown>;
  handleJoinMatchRoom: () => Promise<void>;
  handleRequestDuelMatch: (slotStartAt?: string, options?: { testMode?: boolean }) => Promise<unknown>;
  handleRequestGroupMatch: (slotStartAt?: string, options?: { testMode?: boolean }) => Promise<unknown>;
  navigateToMatchRoomWithTrace: (
    source: string,
    room?: RunningMatchRoom | null,
    serverNow?: string,
    timingSource?: unknown,
  ) => void;
  selectNextDuelSlotForDate: (dateKey: string) => void;
  selectNextGroupSlotForDate: (dateKey: string) => void;
  setMatchMode: Dispatch<SetStateAction<RunMatchMode>>;
  setSelectedDuelDateKey: Dispatch<SetStateAction<string>>;
  setSelectedGroupDateKey: Dispatch<SetStateAction<string>>;
  visibleMatchRoom: RunningMatchRoom | null;
};

export function useTrackRunIdlePressHandlers({
  activeDuelSlotStartAt,
  activeGroupSlotStartAt,
  focusRunningMatch,
  handleAcceptRoomInviteFromRunning,
  handleCancelDuelMatch,
  handleCancelGroupMatch,
  handleCancelUpcomingMatch,
  handleDeclineRoomInviteFromRunning,
  handleJoinMatchRoom,
  handleRequestDuelMatch,
  handleRequestGroupMatch,
  navigateToMatchRoomWithTrace,
  selectNextDuelSlotForDate,
  selectNextGroupSlotForDate,
  setMatchMode,
  setSelectedDuelDateKey,
  setSelectedGroupDateKey,
  visibleMatchRoom,
}: UseTrackRunIdlePressHandlersInput) {
  const handleOpenUpcomingMatch = useStableCallback((match: UpcomingRunningMatchItem) => {
    void focusRunningMatch({
      mode: match.mode,
      distanceKm: match.distanceKm,
      slotStartAt: match.slotStartAt,
      isTestMatch: match.isTestMatch,
    }).catch(() => {});
  });

  const handleCancelUpcomingMatchPress = useStableCallback((match: UpcomingRunningMatchItem) => {
    // 파티런 예약은 확인을 거친 뒤 취소 (공식 예약은 바로) — 홈 카드와 같은 진입점.
    confirmUpcomingMatchCancel(match, (confirmedMatch) => {
      void handleCancelUpcomingMatch(confirmedMatch);
    });
  });

  const handleSelectMatchOption = useStableCallback((option: MatchOptionItem) => {
    if (option.mode === 'room' && visibleMatchRoom) {
      if (isMatchRoomDeleted(visibleMatchRoom.roomId)) {
        rgPerfMark('room entry skipped deleted room', {
          roomId: visibleMatchRoom.roomId,
          source: 'ready option existing room',
          state: visibleMatchRoom.state,
        });
        return;
      }

      rgPerfMark('already joined room detected', {
        roomId: visibleMatchRoom.roomId,
        source: 'ready option select',
        state: visibleMatchRoom.state,
      });
      navigateToMatchRoomWithTrace('ready option existing room', visibleMatchRoom);
      return;
    }

    setMatchMode(option.mode);
  });

  // Competitive pre-flight: 매칭찾기 + 파티런 entries require location "항상 허용" (screen-off GPS
  // measurement) and the motion (step) permission (anti-cheat V1 cadence signal), and soft-request
  // notifications + the Android battery exemption. Each competitive press below awaits the shared
  // guard BEFORE its existing action; the guard shows the shared explanation Alert (with a
  // Settings path) when a blocking step fails. Solo runs stay ungated.
  const handleAcceptRoomInvitePress = useStableCallback(() => {
    void (async () => {
      if (!(await ensureCompetitivePreflight('invite card accept press'))) {
        return;
      }
      await handleAcceptRoomInviteFromRunning();
    })();
  });

  const handleDeclineRoomInvitePress = useStableCallback(() => {
    void handleDeclineRoomInviteFromRunning();
  });

  const handleJoinRoomPress = useStableCallback(async () => {
    if (!(await ensureCompetitivePreflight('invite code join press'))) {
      return;
    }
    await handleJoinMatchRoom();
  });

  const handleSelectDuelDate = useStableCallback((dateKey: string) => {
    setSelectedDuelDateKey(dateKey);
    selectNextDuelSlotForDate(dateKey);
  });

  const handleCancelDuelMatchPress = useStableCallback(() => {
    void handleCancelDuelMatch();
  });

  const handleRequestDuelMatchPress = useStableCallback(() => {
    void (async () => {
      if (!(await ensureCompetitivePreflight('duel match request press'))) {
        return;
      }
      await handleRequestDuelMatch();
    })();
  });

  const handleRequestDuelRematchPress = useStableCallback(() => {
    void (async () => {
      if (!(await ensureCompetitivePreflight('duel rematch request press'))) {
        return;
      }
      await handleRequestDuelMatch(activeDuelSlotStartAt);
    })();
  });

  const handleSelectGroupDate = useStableCallback((dateKey: string) => {
    setSelectedGroupDateKey(dateKey);
    selectNextGroupSlotForDate(dateKey);
  });

  const handleCancelGroupMatchPress = useStableCallback(() => {
    void handleCancelGroupMatch();
  });

  const handleRequestGroupMatchPress = useStableCallback(() => {
    void (async () => {
      if (!(await ensureCompetitivePreflight('group match request press'))) {
        return;
      }
      await handleRequestGroupMatch();
    })();
  });

  const handleRequestGroupRematchPress = useStableCallback(() => {
    void (async () => {
      if (!(await ensureCompetitivePreflight('group rematch request press'))) {
        return;
      }
      await handleRequestGroupMatch(activeGroupSlotStartAt);
    })();
  });

  return {
    handleAcceptRoomInvitePress,
    handleCancelDuelMatchPress,
    handleCancelGroupMatchPress,
    handleCancelUpcomingMatchPress,
    handleDeclineRoomInvitePress,
    handleJoinRoomPress,
    handleOpenUpcomingMatch,
    handleRequestDuelMatchPress,
    handleRequestDuelRematchPress,
    handleRequestGroupMatchPress,
    handleRequestGroupRematchPress,
    handleSelectDuelDate,
    handleSelectGroupDate,
    handleSelectMatchOption,
  };
}
