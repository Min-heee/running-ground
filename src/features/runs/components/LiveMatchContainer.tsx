import { memo, useEffect, useRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { LiveMatchPages } from '@/features/runs/components/LiveMatchPages';
import { LiveMatchTrackingPage } from '@/features/runs/components/LiveMatchTrackingPage';
import { areLiveMatchContainerPropsEqual } from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';
import {
  createMatchArenaDiagnosticsThrottle,
  reportComponentMountDiagnostics,
} from '@/utils/matchArenaDiagnostics';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

type LiveMatchContainerProps = {
  showLiveArena: boolean;
  livePagesProps: Omit<ComponentProps<typeof LiveMatchPages>, 'exitAction'>;
  trackingPageProps: Omit<ComponentProps<typeof LiveMatchTrackingPage>, 'includeMatchCards'>;
  exitAction: ReactNode;
  isSaving: boolean;
  isRunningSolo: boolean;
  isPaused: boolean;
  onSaveTracking: () => void;
  onPauseTracking: () => void;
  onResumeTracking: () => void;
  onDiscardTracking: () => void;
};

export const LiveMatchContainer = memo(function LiveMatchContainer({
  showLiveArena,
  livePagesProps,
  trackingPageProps,
  exitAction,
  isSaving,
  isRunningSolo,
  isPaused,
  onSaveTracking,
  onPauseTracking,
  onResumeTracking,
  onDiscardTracking,
}: LiveMatchContainerProps) {
  useDevRenderCounter(showLiveArena ? 'LiveMatchContainer:arena' : 'LiveMatchContainer:tracking');
  const diagnosticsInstanceIdRef = useRef(`live-container-${Math.random().toString(36).slice(2, 8)}`);
  const diagnosticsThrottleRef = useRef(createMatchArenaDiagnosticsThrottle());
  const hasReportedDiagnosticsMountRef = useRef(false);
  const renderedChild = showLiveArena ? 'LiveMatchPages' : 'LiveMatchTrackingPage';
  const hasRaceBoardProps = livePagesProps.raceBoardProps !== null;
  const hasLiveTrackingProps = livePagesProps.trackingProps !== null;
  const hasResultProps = livePagesProps.resultProps !== null;
  const trackingMatchMode = trackingPageProps.matchMode;

  useEffect(() => {
    const mountPhase = hasReportedDiagnosticsMountRef.current ? 'update' : 'mount';
    hasReportedDiagnosticsMountRef.current = true;
    reportComponentMountDiagnostics({
      componentName: 'LiveMatchContainer',
      instanceId: diagnosticsInstanceIdRef.current,
      mountPhase,
      payload: {
        showLiveArena,
        renderedChild,
        page: livePagesProps.page,
        hasResultPage: livePagesProps.hasResultPage,
        hasRaceBoardProps,
        hasLiveTrackingProps,
        hasResultProps,
        trackingMatchMode,
        isSaving,
        isRunningSolo,
        isPaused,
      },
    }, diagnosticsThrottleRef.current);
  }, [
    hasLiveTrackingProps,
    hasRaceBoardProps,
    hasResultProps,
    isPaused,
    isRunningSolo,
    isSaving,
    livePagesProps.hasResultPage,
    livePagesProps.page,
    renderedChild,
    showLiveArena,
    trackingMatchMode,
  ]);

  return (
    <>
      {showLiveArena ? (
        <LiveMatchPages {...livePagesProps} exitAction={exitAction} />
      ) : (
        <LiveMatchTrackingPage {...trackingPageProps} includeMatchCards />
      )}

      <LiveMatchSavingIndicator isSaving={isSaving} />

      {isRunningSolo ? (
        <LiveMatchSoloActions
          onSaveTracking={onSaveTracking}
          onPauseTracking={onPauseTracking}
        />
      ) : null}

      {isPaused ? (
        <LiveMatchPausedActions
          onSaveTracking={onSaveTracking}
          onResumeTracking={onResumeTracking}
          onDiscardTracking={onDiscardTracking}
        />
      ) : null}
    </>
  );
}, areLiveMatchContainerPropsEqual);

const LiveMatchSavingIndicator = memo(function LiveMatchSavingIndicator({
  isSaving,
}: {
  isSaving: boolean;
}) {
  return isSaving ? <ActivityIndicator size="small" color="#6D5EF7" /> : null;
});

const LiveMatchSoloActions = memo(function LiveMatchSoloActions({
  onSaveTracking,
  onPauseTracking,
}: {
  onSaveTracking: () => void;
  onPauseTracking: () => void;
}) {
  return (
    <View style={styles.actionColumn}>
      <PrimaryButton
        label="러닝 종료하고 저장"
        onPress={onSaveTracking}
      />
      <SecondaryButton label="일시정지" onPress={onPauseTracking} />
    </View>
  );
});

const LiveMatchPausedActions = memo(function LiveMatchPausedActions({
  onSaveTracking,
  onResumeTracking,
  onDiscardTracking,
}: {
  onSaveTracking: () => void;
  onResumeTracking: () => void;
  onDiscardTracking: () => void;
}) {
  return (
    <View style={styles.actionColumn}>
      <PrimaryButton label="이 기록 저장하기" onPress={onSaveTracking} />
      <SecondaryButton label="측정 다시 시작" onPress={onResumeTracking} />
      <Pressable style={styles.discardButton} onPress={onDiscardTracking}>
        <Text style={styles.discardButtonText}>이 기록 버리기</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  actionColumn: {
    gap: 10,
  },
  discardButton: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  discardButtonText: {
    color: '#B42318',
    fontWeight: '700',
  },
});
