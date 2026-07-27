import { useEffect, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchExitActionCard } from '@/features/runs/components/LiveMatchExitActionCard';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { useForfeitController } from '@/features/runs/hooks/useForfeitController';
import { useRunActionHandlers } from '@/features/runs/hooks/useRunActionHandlers';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { useLiveMatchViewModel } from '@/features/runs/viewModels/useLiveMatchViewModel';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type RunActionHandlers = ReturnType<typeof useRunActionHandlers>;

type UseLiveMatchRuntimeInput = {
  actionHandlers: Pick<
    RunActionHandlers,
    | 'handleDiscardTrackingPress'
    | 'handlePauseTrackingPress'
    | 'handleResumeTrackingPress'
    | 'handleSaveTrackingPress'
  >;
  forfeitControllerInput: Parameters<typeof useForfeitController>[0];
  isPaused: boolean;
  isRunning: boolean;
  isSaving: boolean;
  matchMode: RunMatchMode;
  showLiveArena: boolean;
  viewModelInput: Parameters<typeof useLiveMatchViewModel>[0];
};

export function useLiveMatchRuntime({
  actionHandlers,
  forfeitControllerInput,
  isPaused,
  isRunning,
  isSaving,
  matchMode,
  showLiveArena,
  viewModelInput,
}: UseLiveMatchRuntimeInput): ComponentProps<typeof LiveMatchContainer> {
  useEffect(() => {
    rgPerfMark('track run runtime adapter selected', {
      adapter: 'live',
      matchMode,
      source: 'track-run runtime',
    });
    rgPerfMark('live runtime mounted', {
      matchMode,
      source: 'track-run runtime',
    });
  }, [matchMode]);

  const liveArenaExitActionProps = useForfeitController(forfeitControllerInput);
  const liveArenaExitAction = useMemo(
    () => <LiveMatchExitActionCard {...liveArenaExitActionProps} />,
    [liveArenaExitActionProps],
  );
  const {
    livePagesProps,
    trackingPageProps: liveTrackingPageBaseProps,
  } = useLiveMatchViewModel(viewModelInput);
  const hiddenTrackingPagePropsRef = useRef(liveTrackingPageBaseProps);
  const containerTrackingPageProps = showLiveArena
    ? hiddenTrackingPagePropsRef.current
    : liveTrackingPageBaseProps;

  return useMemo(() => ({
    showLiveArena,
    livePagesProps,
    trackingPageProps: containerTrackingPageProps,
    exitAction: liveArenaExitAction,
    isSaving,
    // chase(경찰과 도둑런)는 라이브 매치 아레나가 없는 솔로형 러닝 — 솔로 액션(일시정지/저장)을
    // 그대로 쓴다. 이게 빠지면 체이스 러닝은 종료 버튼이 없어 앱 강제종료 말고는 못 끝낸다.
    isRunningSolo: isRunning && (matchMode === 'solo' || matchMode === 'chase'),
    isPaused,
    onSaveTracking: actionHandlers.handleSaveTrackingPress,
    onPauseTracking: actionHandlers.handlePauseTrackingPress,
    onResumeTracking: actionHandlers.handleResumeTrackingPress,
    onDiscardTracking: actionHandlers.handleDiscardTrackingPress,
  }), [
    actionHandlers.handleDiscardTrackingPress,
    actionHandlers.handlePauseTrackingPress,
    actionHandlers.handleResumeTrackingPress,
    actionHandlers.handleSaveTrackingPress,
    isPaused,
    isRunning,
    isSaving,
    liveArenaExitAction,
    livePagesProps,
    containerTrackingPageProps,
    matchMode,
    showLiveArena,
  ]);
}
