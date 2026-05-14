import { useCallback, useRef } from 'react';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type StartTrackingOptions = {
  allowCountdownWarmup?: boolean;
  matchId?: string;
};

type UseRunActionHandlersInput = {
  matchMode: RunMatchMode;
  matchRoom: RunningMatchRoom | null;
  handleSaveTracking: () => Promise<unknown>;
  handlePauseTracking: () => Promise<void>;
  handleResumeTracking: () => Promise<void>;
  handleDiscardTracking: () => void;
  handleCreateMatchRoom: () => Promise<unknown> | void;
  handleStartTracking: (options?: StartTrackingOptions) => Promise<unknown> | void;
  navigateToMatchRoomWithTrace: (source: string, roomId: string) => void;
};

export function useRunActionHandlers({
  matchMode,
  matchRoom,
  handleSaveTracking,
  handlePauseTracking,
  handleResumeTracking,
  handleDiscardTracking,
  handleCreateMatchRoom,
  handleStartTracking,
  navigateToMatchRoomWithTrace,
}: UseRunActionHandlersInput) {
  const latestHandlersRef = useRef({
    handleSaveTracking,
    handlePauseTracking,
    handleResumeTracking,
    handleDiscardTracking,
    handleCreateMatchRoom,
    handleStartTracking,
    navigateToMatchRoomWithTrace,
  });

  latestHandlersRef.current = {
    handleSaveTracking,
    handlePauseTracking,
    handleResumeTracking,
    handleDiscardTracking,
    handleCreateMatchRoom,
    handleStartTracking,
    navigateToMatchRoomWithTrace,
  };

  const handleSaveTrackingPress = useCallback(() => {
    void latestHandlersRef.current.handleSaveTracking();
  }, []);

  const handlePauseTrackingPress = useCallback(() => {
    void latestHandlersRef.current.handlePauseTracking();
  }, []);

  const handleResumeTrackingPress = useCallback(() => {
    void latestHandlersRef.current.handleResumeTracking();
  }, []);

  const handleDiscardTrackingPress = useCallback(() => {
    latestHandlersRef.current.handleDiscardTracking();
  }, []);

  const handleReadyAction = useCallback(() => {
    if (matchMode === 'room') {
      if (matchRoom) {
        rgPerfMark('already joined room detected', {
          roomId: matchRoom.roomId,
          source: 'ready action existing room',
          state: matchRoom.state,
        });
        latestHandlersRef.current.navigateToMatchRoomWithTrace('ready action existing room', matchRoom.roomId);
        return;
      }
      void latestHandlersRef.current.handleCreateMatchRoom();
      return;
    }

    void latestHandlersRef.current.handleStartTracking();
  }, [matchMode, matchRoom]);

  return {
    handleDiscardTrackingPress,
    handlePauseTrackingPress,
    handleReadyAction,
    handleResumeTrackingPress,
    handleSaveTrackingPress,
  };
}
