// 혼자 러닝의 시작 영역 (오너 2026-08-03, 시안 D+다 확정).
//
// RUN 세로 히어로 블록(브랜드 솔리드, 센터 타이포)이 화면의 주인공이고, 아래 두 부가
// 기능은 RUN과 같은 센터 타이포 결의 미니 히어로 타일(PACE / VS ME 오버라인 + 한글
// 제목)로 반반. 장식 아이콘 없이 타이포만으로 무게를 준다.

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
    const trace = beginRgInputTrace('solo run start press', { source: 'solo hero block' });
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
        <Text style={styles.startOverline}>RUN</Text>
        <Text style={styles.startText}>{startLabel}</Text>
      </Pressable>

      <View style={styles.subRow}>
        <SubTile overline="PACE" label="페이스메이커와 달리기" onPress={onOpenPacemaker} />
        <SubTile overline="VS ME" label="자신과 대결" onPress={onOpenGhostRun} />
      </View>
    </View>
  );
});

const SubTile = memo(function SubTile({
  overline,
  label,
  onPress,
}: {
  overline: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.subTile, pressed ? styles.subTilePressed : undefined]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.subTileOverline}>{overline}</Text>
      <Text style={styles.subTileLabel}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.s10,
  },
  // 틴트가 brandWash 토큰이 아닌 고정 rgba인 이유: 라이트 brandWash(#EEF2FF)는 앱 배경
  // (#EFF0FA)과 거의 같은 색이라 버튼이 사라졌다. 반투명 브랜드는 밝은 배경에선 연보라,
  // 다크 네이비 위에선 보라 유리로 앉아 양쪽 모드에서 성립한다(2026-07-27 승인된 그 톤).
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
    // 세로 히어로 — 시안 D의 두툼한 블록 (paddingVertical 24 + 오버라인/서브 두 줄).
    paddingVertical: spacing.s24,
    borderRadius: radii.cardLarge,
    backgroundColor: fixedColors.brand,
    gap: spacing.xs,
  },
  startButtonPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startOverline: {
    color: fixedColors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
    letterSpacing: 2,
  },
  startText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  subRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  subTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s18,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.cardLarge,
    backgroundColor: 'rgba(109, 94, 247, 0.13)',
    borderWidth: 1.5,
    borderColor: 'rgba(142, 123, 255, 0.5)',
    gap: spacing.xxs,
  },
  subTilePressed: {
    backgroundColor: 'rgba(109, 94, 247, 0.26)',
  },
  subTileOverline: {
    color: colors.brandDeep,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
    letterSpacing: 0.5,
  },
  subTileLabel: {
    color: colors.brandMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
});
