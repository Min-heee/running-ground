import type { Dispatch, SetStateAction } from 'react';
import { Alert } from 'react-native';
import { useStableCallback } from '@/features/runs/runtime/useStableCallback';
import type { RunningMatchRoom } from '@/lib/api/types';
import {
  forceResetRunningMatchState,
  getApiErrorMessage,
} from '@/services';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunForceResetActionInput = {
  clearLocalDuelMatchState: (notice?: string | null) => void;
  clearLocalGroupMatchState: (notice?: string | null) => void;
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  isForceResettingRunningMatch: boolean;
  refreshStaleMatchArtifacts: () => Promise<unknown>;
  setError: Dispatch<SetStateAction<string | null>>;
  setForceOpenActiveMatch: Dispatch<SetStateAction<boolean>>;
  setIsForceResettingRunningMatch: Dispatch<SetStateAction<boolean>>;
  setSelectedRoomFriendIds: Dispatch<SetStateAction<string[]>>;
};

export function useTrackRunForceResetAction({
  clearLocalDuelMatchState,
  clearLocalGroupMatchState,
  commitMatchRoom,
  isForceResettingRunningMatch,
  refreshStaleMatchArtifacts,
  setError,
  setForceOpenActiveMatch,
  setIsForceResettingRunningMatch,
  setSelectedRoomFriendIds,
}: UseTrackRunForceResetActionInput) {
  const runForceResetRunningMatchState = useStableCallback(async () => {
    if (isForceResettingRunningMatch) {
      return;
    }

    setIsForceResettingRunningMatch(true);
    try {
      const payload = await forceResetRunningMatchState();
      rgPerfMark('running match force reset completed', {
        cleaned: payload.cleaned,
        cleanedItems: payload.cleanedItems.join(','),
        source: 'track-run emergency reset',
      });
      commitMatchRoom(null);
      setSelectedRoomFriendIds([]);
      clearLocalDuelMatchState(null);
      clearLocalGroupMatchState(null);
      setForceOpenActiveMatch(false);
      setError(null);
      await refreshStaleMatchArtifacts().catch(() => {});
      Alert.alert('초기화 완료', '다시 방 만들기 또는 매칭을 눌러주세요.');
    } catch (resetError) {
      Alert.alert(
        '초기화 실패',
        getApiErrorMessage(resetError, '매칭 상태를 강제로 초기화하지 못했어요.'),
      );
    } finally {
      setIsForceResettingRunningMatch(false);
    }
  });

  const handleForceResetRunningMatchPress = useStableCallback(() => {
    Alert.alert(
      '강제 초기화',
      '진행 중인 모든 매치/방/대기열을 강제로 정리합니다. 진행 중인 대결은 패배 처리될 수 있어요. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            void runForceResetRunningMatchState();
          },
        },
      ],
    );
  });

  return {
    handleForceResetRunningMatchPress,
  };
}
