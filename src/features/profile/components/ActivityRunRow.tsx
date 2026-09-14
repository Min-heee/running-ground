import { memo, useCallback } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyRunRecord } from '@/domain';
import { formatActivityRunDayLabel } from '@/features/profile/utils/activityMonthGroups';
import { getRunKindLabel } from '@/features/runs/utils/runKind';
import { getRunOutcome, type RunOutcomeTone } from '@/features/runs/utils/runOutcome';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { formatDistanceValue } from '@/utils/formatUnits';
import { parsePaceSecondsPerKm } from '@/utils/runDuration';

// 기록 한 줄 (오너 2026-09-14). 주인공은 거리 — 예전엔 사람이 안 읽는 ISO 날짜가 제일 컸다.
// 행 전체가 이미 상세로 가는 버튼이라 '보기' 링크는 순수 중복이었고, 셰브런도 안 붙인다(무장식).
//
// ⚠️ `<Link asChild>`로 감싸지 말 것. Slot이 Link의 style(웹에선 className 주입용)과 자식 style을
// **배열로 병합**하는데, RN 스타일 배열은 함수를 못 푼다 — 눌림 상태를 쓰려고 함수형 style을 주면
// 행 스타일이 통째로 사라진다(패딩 0으로 납작해지는 걸 실측). 그래서 router.push로 직접 간다.

export const ActivityRunRow = memo(function ActivityRunRow({
  run,
  isFirst,
}: {
  run: MyRunRecord;
  isFirst: boolean;
}) {
  const dayLabel = formatActivityRunDayLabel(run.date);
  // 기권·정지 저장은 pace가 '00:00/km'로, 측정 불가는 '--:--/km'로 남는다.
  // 파싱이 안 되면 페이스 구간을 통째로 뺀다 — 쓰레기 값을 행에 찍지 않는다.
  const paceLabel = parsePaceSecondsPerKm(run.pace) === null ? null : run.pace;
  const kindLabel = getRunKindLabel(run);
  const outcome = getRunOutcome(run);
  const metaText = [dayLabel, paceLabel, kindLabel].filter(Boolean).join(' · ');
  const distanceLabel = formatDistanceValue(run.distanceKm);
  const handlePress = useCallback(() => {
    router.push({ pathname: '/run-detail', params: { runId: run.id } });
  }, [run.id]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={[dayLabel, `${distanceLabel}킬로미터`, kindLabel, outcome?.label]
        .filter(Boolean)
        .join(' ')}
      style={({ pressed }) => [
        styles.row,
        isFirst ? null : styles.rowDivided,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.body}>
        <Text style={styles.distance}>
          {distanceLabel}
          <Text style={styles.unit}>km</Text>
        </Text>
        <Text style={styles.meta} numberOfLines={1}>{metaText}</Text>
      </View>
      {outcome ? (
        <Text
          style={[styles.outcome, OUTCOME_TONE_STYLES[outcome.tone]]}
          numberOfLines={1}
        >
          {outcome.label}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingVertical: spacing.s14,
    paddingHorizontal: spacing.s16,
  },
  // padding 0인 카드의 직계 자식이라 구분선이 카드 폭 끝에서 끝까지 이어진다.
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  distance: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.black,
    includeFontPadding: false,
  },
  unit: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  outcome: {
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
    // 없으면 'Nike Run Club' 같은 긴 출처가 결과 글자를 찌그러뜨린다 — 말줄임은 meta가 맡는다.
    flexShrink: 0,
  },
});

// 인라인 색 계산 금지: memo 행마다 새 객체가 생기고, 코드에 색을 직접 쓰고 싶어지는 자리가 된다.
const OUTCOME_TONE_STYLES: Record<RunOutcomeTone, { color: string; fontSize?: number; fontWeight?: '700' }> =
  StyleSheet.create({
    win: { color: colors.successText },
    lose: { color: colors.danger },
    draw: { color: colors.textSecondary },
    // brand(#6D5EF7)는 다크 유리 위에서 대비가 모자라 brandStrong을 쓴다.
    top: { color: colors.brandStrong },
    rank: { color: colors.textPrimary },
    // '집계 중'은 결과가 아니라 상태라 한 급 낮춘다.
    pending: {
      color: colors.textSecondary,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
    },
  });
