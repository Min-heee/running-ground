import { memo } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { LiveMatchPages } from '@/features/runs/components/LiveMatchPages';
import { LiveMatchTrackingPage } from '@/features/runs/components/LiveMatchTrackingPage';
import {
  areLiveMatchContainerPropsEqual,
  shouldShowPausedTrackingActions,
} from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';
import { colors, spacing, fontWeights } from '@/theme/tokens';

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
  const showPausedActions = shouldShowPausedTrackingActions({
    hasResultPage: livePagesProps.hasResultPage,
    isPaused,
    showLiveArena,
  });

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

      {showPausedActions ? (
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
  return isSaving ? <ActivityIndicator size="small" color={colors.brand} /> : null;
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
    gap: spacing.s10,
  },
  discardButton: {
    alignSelf: 'center',
    paddingVertical: spacing.lg,
  },
  discardButtonText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
});
