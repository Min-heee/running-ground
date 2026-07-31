// 혼자 러닝의 시작 영역 (오너 2026-07-31, 시안 B).
//
// 이 탭에 오는 사람의 목적은 십중팔구 '지금 뛰기'다. 그래서 시작을 화면 한가운데 원형으로
// 두어 무게중심을 잡고, 페이스메이커·자신과 대결은 그 아래 곁가지로 내린다. 위쪽 요약은
// 뛰기 전에 한 번 보게 되는 숫자(이번 주 거리/횟수)만 둔다.
//
// 요약은 있으면 좋고 없어도 그만인 정보라 실패하면 조용히 접는다 — 이것 때문에 시작 버튼이
// 늦게 뜨거나 에러가 보이면 안 된다.

import { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { WeeklySummary } from '@/domain';
import { fetchHomeSummary } from '@/services';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type SoloRunHeroPanelProps = {
  startLabel: string;
  startDisabled: boolean;
  onStart: () => void;
  onOpenPacemaker: () => void;
  onOpenGhostRun: () => void;
};

function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)}km`;
}

export const SoloRunHeroPanel = memo(function SoloRunHeroPanel({
  startLabel,
  startDisabled,
  onStart,
  onOpenPacemaker,
  onOpenGhostRun,
}: SoloRunHeroPanelProps) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);

  useEffect(() => {
    let active = true;

    fetchHomeSummary()
      .then((response) => {
        if (active) {
          setSummary(response);
        }
      })
      .catch(() => {
        // 요약은 부가 정보 — 실패하면 그냥 보여주지 않는다.
      });

    return () => {
      active = false;
    };
  }, []);

  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo hero' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  return (
    <View style={styles.panel}>
      {summary ? (
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>이번 주</Text>
            <Text style={styles.statValue}>{formatDistance(summary.totalDistanceKm)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>러닝</Text>
            <Text style={styles.statValue}>{summary.totalRuns}회</Text>
          </View>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.startCircle,
          startDisabled ? styles.startCircleDisabled : undefined,
          pressed && !startDisabled ? styles.startCirclePressed : undefined,
        ]}
        onPress={handleStart}
        disabled={startDisabled}
        accessibilityRole="button"
        accessibilityLabel={startLabel}
      >
        <Feather name="play" size={30} color={fixedColors.white} />
        <Text style={styles.startText}>시작</Text>
      </Pressable>

      <View style={styles.sideRow}>
        <SideButton label="페이스메이커" onPress={onOpenPacemaker} />
        <SideButton label="자신과 대결" onPress={onOpenGhostRun} />
      </View>
    </View>
  );
});

const SideButton = memo(function SideButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.sideButton, pressed ? styles.sideButtonPressed : undefined]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.sideButtonText}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: spacing.s18,
    paddingVertical: spacing.s10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s20,
  },
  stat: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  // 시작은 이 화면에서 가장 큰 목표물 — 지름은 손가락으로 대충 눌러도 맞는 크기로.
  startCircle: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    backgroundColor: fixedColors.brand,
  },
  startCirclePressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  startCircleDisabled: {
    opacity: 0.6,
  },
  startText: {
    color: fixedColors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  sideRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: spacing.s10,
  },
  sideButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.s14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sideButtonPressed: {
    borderColor: colors.brandLight,
  },
  sideButtonText: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
