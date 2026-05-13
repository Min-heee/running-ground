import { memo } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { LiveMatchPages } from '@/features/runs/components/LiveMatchPages';
import { LiveMatchTrackingPage } from '@/features/runs/components/LiveMatchTrackingPage';

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
  return (
    <>
      {showLiveArena ? (
        <LiveMatchPages {...livePagesProps} exitAction={exitAction} />
      ) : (
        <LiveMatchTrackingPage {...trackingPageProps} includeMatchCards />
      )}

      {isSaving ? <ActivityIndicator size="small" color="#6D5EF7" /> : null}

      {isRunningSolo ? (
        <View style={styles.actionColumn}>
          <PrimaryButton
            label="러닝 종료하고 저장"
            onPress={onSaveTracking}
          />
          <SecondaryButton label="일시정지" onPress={onPauseTracking} />
        </View>
      ) : null}

      {isPaused ? (
        <View style={styles.actionColumn}>
          <PrimaryButton label="이 기록 저장하기" onPress={onSaveTracking} />
          <SecondaryButton label="측정 다시 시작" onPress={onResumeTracking} />
          <Pressable style={styles.discardButton} onPress={onDiscardTracking}>
            <Text style={styles.discardButtonText}>이 기록 버리기</Text>
          </Pressable>
        </View>
      ) : null}
    </>
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
