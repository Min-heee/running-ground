// 혼자 러닝의 시작 영역 (오너 2026-07-31, 시안 H).
//
// 이번 주 요일별 막대 → 한 줄 요약 → 시작 버튼 → 페이스메이커/자신과 대결.
// 막대를 맨 위에 두는 이유: 오늘 칸이 비어 있는 게 눈에 보이는 게 이 화면에서 가장 강한
// 동기다. 시작 버튼 문구는 모드 모델이 주는 라벨을 그대로 쓴다(다른 모드와 같은 규칙).
//
// 기록 조회는 부가 정보라 실패해도 조용히 접는다 — 그것 때문에 시작 버튼이 늦게 뜨거나
// 에러가 보이면 안 된다.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MyRunRecord } from '@/domain';
import { fetchMyActivity } from '@/services';
import { buildSoloWeekSummary } from '@/features/runs/utils/soloWeekSummary';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const BAR_MAX_HEIGHT = 72;
const BAR_EMPTY_HEIGHT = 8;

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
  const [runs, setRuns] = useState<MyRunRecord[] | null>(null);

  useEffect(() => {
    let active = true;

    fetchMyActivity()
      .then((response) => {
        if (active) {
          setRuns(response.runs);
        }
      })
      .catch(() => {
        // 이번 주 흐름은 부가 정보 — 실패하면 그냥 보여주지 않는다.
      });

    return () => {
      active = false;
    };
  }, []);

  const week = useMemo(() => (runs ? buildSoloWeekSummary(runs) : null), [runs]);
  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo hero' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  return (
    <View style={styles.panel}>
      {week ? (
        <View style={styles.weekBlock}>
          <View style={styles.barRow}>
            {week.bars.map((bar) => {
              const ratio = week.maxDistanceKm > 0 ? bar.distanceKm / week.maxDistanceKm : 0;
              const barHeight = bar.distanceKm > 0
                ? Math.max(BAR_EMPTY_HEIGHT, Math.round(ratio * BAR_MAX_HEIGHT))
                : BAR_EMPTY_HEIGHT;

              return (
                <View key={bar.key} style={styles.barColumn}>
                  <View
                    style={[
                      styles.bar,
                      { height: barHeight },
                      bar.distanceKm > 0
                        ? (bar.isToday ? styles.barToday : styles.barFilled)
                        : (bar.isToday ? styles.barTodayEmpty : styles.barEmpty),
                    ]}
                  />
                  <Text style={bar.isToday ? styles.barLabelToday : styles.barLabel}>
                    {bar.isToday ? '오늘' : bar.label}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.weekSummary}>
            {week.runCount > 0
              ? `이번 주 ${formatDistance(week.totalDistanceKm)} · ${week.runCount}회`
              : '이번 주는 아직 기록이 없어요'}
            {week.todayDistanceKm > 0 ? ` · 오늘 ${formatDistance(week.todayDistanceKm)}` : ''}
          </Text>
        </View>
      ) : null}

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
        <Feather name="play" size={20} color={fixedColors.white} />
        <Text style={styles.startText}>{startLabel}</Text>
      </Pressable>

      <View style={styles.sideRow}>
        <SideCard badge="음성 코칭" label="페이스메이커" onPress={onOpenPacemaker} />
        <SideCard badge="고스트" label="자신과 대결" onPress={onOpenGhostRun} />
      </View>
    </View>
  );
});

const SideCard = memo(function SideCard({
  badge,
  label,
  onPress,
}: {
  badge: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.sideCard, pressed ? styles.sideCardPressed : undefined]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.sideCardBadge}>
        <Text style={styles.sideCardBadgeText}>{badge}</Text>
      </View>
      <Text style={styles.sideCardLabel}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.s14,
  },
  weekBlock: {
    gap: spacing.s10,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    height: BAR_MAX_HEIGHT + 20,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  bar: {
    width: '100%',
    borderRadius: radii.xs,
  },
  barFilled: {
    backgroundColor: colors.brandLight,
  },
  barToday: {
    backgroundColor: colors.brand,
  },
  // 아직 안 뛴 날 — 자리는 잡되 존재감은 낮게.
  barEmpty: {
    backgroundColor: colors.borderMuted,
  },
  // 오늘인데 아직 안 뛴 상태를 한눈에: 비어 있지만 브랜드 색으로 표시된다.
  barTodayEmpty: {
    backgroundColor: colors.brandWash,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
  },
  barLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
  },
  barLabelToday: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  weekSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingVertical: spacing.s18,
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
  sideRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  // 오너 요청 2026-07-31: 아이콘 없이 배지 + 제목만, 카드 자체를 브랜드 톤으로 (시안 4).
  // 곁가지지만 눌러야 존재를 아는 기능이라 크기는 크게 유지한다.
  // 색은 전부 테마 토큰 — brandWash/brandSoftBorder/brandDeep은 라이트에선 연보라 배경 +
  // 진한 보라 글씨, 다크에선 반투명 보라 + 밝은 라벤더 글씨로 뒤집힌다.
  sideCard: {
    flex: 1,
    gap: spacing.s10,
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s14,
    minHeight: 108,
    justifyContent: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
    backgroundColor: colors.brandWash,
  },
  sideCardPressed: {
    borderColor: colors.brandLight,
    backgroundColor: colors.brandWashStrong,
  },
  sideCardBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  sideCardBadgeText: {
    color: colors.brandDeep,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  sideCardLabel: {
    color: colors.brandDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
