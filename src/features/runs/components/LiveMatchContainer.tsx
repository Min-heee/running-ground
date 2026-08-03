import { memo } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LiveMatchPages } from '@/features/runs/components/LiveMatchPages';
import { LiveMatchTrackingPage } from '@/features/runs/components/LiveMatchTrackingPage';
import {
  areLiveMatchContainerPropsEqual,
  shouldShowPausedTrackingActions,
} from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';
import { colors, fixedColors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

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
        <LiveMatchSoloActions onPauseTracking={onPauseTracking} />
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

// 미디어 컨트롤 (오너 2026-08-03): 텍스트 버튼 대신 ⏸/▶/■ 원형 버튼.
// 뛰는 중엔 ⏸ 하나 — 누르면 일시정지되고, 일시정지 화면에서 ▶(재개)와 ■(종료·저장)이
// 나온다. 종료가 일시정지를 거쳐야만 나오므로 실수 종료가 구조적으로 불가능하다.
const LiveMatchSoloActions = memo(function LiveMatchSoloActions({
  onPauseTracking,
}: {
  onPauseTracking: () => void;
}) {
  return (
    <View style={styles.controlRow}>
      <Pressable
        style={({ pressed }) => [styles.controlCircle, pressed ? styles.controlCirclePressed : null]}
        onPress={onPauseTracking}
        accessibilityRole="button"
        accessibilityLabel="일시정지"
      >
        <View style={styles.pauseBars}>
          <View style={styles.pauseBar} />
          <View style={styles.pauseBar} />
        </View>
      </Pressable>
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
      <View style={styles.controlRow}>
        <View style={styles.controlItem}>
          <Pressable
            style={({ pressed }) => [styles.controlCircle, pressed ? styles.controlCirclePressed : null]}
            onPress={onResumeTracking}
            accessibilityRole="button"
            accessibilityLabel="측정 다시 시작"
          >
            <View style={styles.playTriangle} />
          </Pressable>
          <Text style={styles.controlLabel}>재개</Text>
        </View>
        <View style={styles.controlItem}>
          <Pressable
            style={({ pressed }) => [
              styles.controlCircle,
              styles.stopCircle,
              pressed ? styles.stopCirclePressed : null,
            ]}
            onPress={onSaveTracking}
            accessibilityRole="button"
            accessibilityLabel="러닝 종료하고 저장"
          >
            <View style={styles.stopSquare} />
          </Pressable>
          <Text style={styles.controlLabel}>종료하고 저장</Text>
        </View>
      </View>
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
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.s24,
    paddingVertical: spacing.sm,
  },
  controlItem: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: fixedColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlCirclePressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  stopCircle: {
    backgroundColor: fixedColors.textPrimary,
  },
  stopCirclePressed: {
    opacity: 0.85,
  },
  controlLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  pauseBars: {
    flexDirection: 'row',
    gap: 8,
  },
  pauseBar: {
    width: 9,
    height: 34,
    borderRadius: 4,
    backgroundColor: fixedColors.white,
  },
  // 재생 삼각형 — 보더 트릭. 시각 중심을 맞추려 살짝 오른쪽으로.
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 18,
    borderBottomWidth: 18,
    borderLeftWidth: 28,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: fixedColors.white,
    marginLeft: 8,
  },
  stopSquare: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: fixedColors.white,
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
