import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { getSelectedChaseArena } from '@/features/runs/chase/chaseRunContext';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { joinChaseArena } from '@/services';
import { getApiErrorMessage } from '@/services/apiError';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import type { RunningMatchRoom } from '@/lib/api/types';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type StartTrackingOptions = {
  allowCountdownWarmup?: boolean;
  matchId?: string;
  chaseArena?: {
    arenaId: string;
    arenaName: string;
    latitude: number;
    longitude: number;
    radiusM: number;
    polygon?: { latitude: number; longitude: number }[];
  };
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
  navigateToMatchRoomWithTrace: (source: string, room: RunningMatchRoom) => void;
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
  const chaseJoinInFlightRef = useRef(false);
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
        if (isMatchRoomDeleted(matchRoom.roomId)) {
          rgPerfMark('room entry skipped deleted room', {
            roomId: matchRoom.roomId,
            source: 'ready action existing room',
            state: matchRoom.state,
          });
          return;
        }

        const inputTrace = beginRgInputTrace('room lobby button press', {
          roomId: matchRoom.roomId,
          source: 'ready action existing room',
          state: matchRoom.state,
        });
        rgPerfMark('already joined room detected', {
          roomId: matchRoom.roomId,
          source: 'ready action existing room',
          state: matchRoom.state,
        });
        inputTrace.markFeedback('navigation begin');
        latestHandlersRef.current.navigateToMatchRoomWithTrace('ready action existing room', matchRoom);
        return;
      }
      void latestHandlersRef.current.handleCreateMatchRoom();
      return;
    }

    if (matchMode === 'chase') {
      // 경찰과 도둑런: 경기장 슬롯(정원 30/100)을 먼저 확보한 뒤에만 GPS 시작.
      // 더블탭 가드 — 입장 왕복 동안 두 번째 탭이 새 시작을 쏘아 러닝을 리셋하는 것 차단
      // (솔로형이라 단일비행 시작 키가 이미 풀려 있을 수 있다).
      if (chaseJoinInFlightRef.current) {
        return;
      }

      const selectedArena = getSelectedChaseArena();

      if (!selectedArena) {
        Alert.alert('경기장 선택', '먼저 달릴 경기장을 선택해주세요.');
        return;
      }

      chaseJoinInFlightRef.current = true;
      void (async () => {
        let joinedArena: {
          arenaId: string;
          arenaName: string;
          latitude: number;
          longitude: number;
          radiusM: number;
          polygon?: { latitude: number; longitude: number }[];
        };

        try {
          const joinResult = await joinChaseArena(selectedArena.id);
          joinedArena = {
            arenaId: joinResult.arenaId,
            arenaName: joinResult.arenaName,
            latitude: joinResult.latitude,
            longitude: joinResult.longitude,
            radiusM: joinResult.radiusM,
            ...(joinResult.polygon ? { polygon: joinResult.polygon } : {}),
          };
        } catch (joinError) {
          chaseJoinInFlightRef.current = false;
          Alert.alert('경기장 입장 실패', getApiErrorMessage(joinError, '경기장에 입장하지 못했어요.'));
          return;
        }

        try {
          // 입장에 성공한 그 경기장을 시작 옵션으로 전달 — 시작 파이프라인이 이 값을 잠근다.
          await latestHandlersRef.current.handleStartTracking({ chaseArena: joinedArena });
        } finally {
          chaseJoinInFlightRef.current = false;
        }
      })();
      return;
    }

    if (matchMode === 'solo') {
      const inputTrace = beginRgInputTrace('start solo run button press', {
        mode: matchMode,
        source: 'ready action',
      });
      inputTrace.markFeedback('tracking start dispatch');
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
