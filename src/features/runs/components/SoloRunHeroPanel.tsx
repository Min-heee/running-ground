// 혼자 러닝의 시작 영역 (오너 2026-07-31, 시안 Q 확정).
//
// 풀폭 버튼 세 개 — 장식 없이 높이와 색 농도로만 위계를 준다. 시작은 크고 진한 브랜드
// 솔리드, 페이스메이커·자신과 대결은 낮고 연한 브랜드 워시. 셋 다 전체 폭이라 무엇이든
// 한 번에 눌리고, 두 부가 기능도 항상 눈에 보인다(시트/스와이프 뒤에 숨지 않는다).

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type SoloRunHeroPanelProps = {
  startLabel: string;
  startDisabled: boolean;
  onStart: () => void;
  onOpenPacemaker: () => void;
  onOpenGhostRun: () => void;
};

export const SoloRunHeroPanel = memo(function SoloRunHeroPanel({
  startLabel,
  startDisabled,
  onStart,
  onOpenPacemaker,
  onOpenGhostRun,
}: SoloRunHeroPanelProps) {
  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo stacked buttons' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  return (
    <View style={styles.panel}>
      <Pressable
        style={({ pressed }) => [
          styles.startButton,
          startDisabled ? styles.startButtonDisabled : undefined,
          pressed && !startDisabled ? styles.startButtonPressed : undefined,
        ]}
        onPress={handleStart}
        disabled={startDisabled}
        accessibilityRole="button"
        accessibilityLabel={startLabel}
      >
        <Text style={styles.startText}>{startLabel}</Text>
      </Pressable>

      <SubButton label="페이스메이커와 달리기" onPress={onOpenPacemaker} />
      <SubButton label="자신과 대결" onPress={onOpenGhostRun} />
    </View>
  );
});

const SubButton = memo(function SubButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.subButton, pressed ? styles.subButtonPressed : undefined]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.subButtonText}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.xxl,
  },
  // 위계 규칙: 시작만 크고 진하게, 나머지는 낮고 연하게. 색은 테마 토큰이라 라이트에선
  // 연보라 워시 + 진보라 글씨, 다크에선 반투명 보라 + 밝은 라벤더 글씨로 뒤집힌다.
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s22,
    borderRadius: radii.xl,
    backgroundColor: fixedColors.brand,
  },
  startButtonPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startText: {
    color: fixedColors.white,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
  },
  subButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s14,
    borderRadius: radii.lg,
    backgroundColor: colors.brandWash,
  },
  subButtonPressed: {
    backgroundColor: colors.brandWashStrong,
  },
  subButtonText: {
    color: colors.brandDeep,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
