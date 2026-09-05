import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeWeeklyStreakBadgeProps = {
  // 서버 파생 현재 주 연속 (홈 summary.weeklyStreakWeeks). 0/1주는 렌더하지 않는다 —
  // 뱃지는 2주 연속부터 (오너 2026-09-01: "이번주에 뛰고 다음주에 뛰면 2주연속 뱃지").
  weeks: number;
  // 이번 주에 이미 자격(주 합계 ≥ 문턱)을 채웠는지 — 안내 문구 분기용.
  ranThisWeek: boolean;
  // 주 합계 자격 문턱(km) — 서버 값. 문구에 명시해 "뛰었는데 왜 안 이어져?"를 없앤다.
  minWeekDistanceKm: number;
};

function HomeWeeklyStreakBadgeImpl({ weeks, ranThisWeek, minWeekDistanceKm }: HomeWeeklyStreakBadgeProps) {
  if (weeks < 2) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.fireWrap}>
        <MaterialCommunityIcons name="fire" size={22} color={fixedColors.brand} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{weeks}주 연속 러닝</Text>
        <Text style={styles.helper}>
          {ranThisWeek
            ? `다음 주에도 달리면 ${weeks + 1}주 연속이에요`
            : `이번 주 ${minWeekDistanceKm}km 이상 달리면 ${weeks + 1}주로 이어져요`}
        </Text>
      </View>
      <View style={styles.weekPill}>
        <Text style={styles.weekPillText}>{weeks}주</Text>
      </View>
    </Card>
  );
}

export const HomeWeeklyStreakBadge = memo(HomeWeeklyStreakBadgeImpl);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    backgroundColor: fixedColors.brandWashStrong,
  },
  // 배경(brandWashStrong)이 고정 밝은 색이므로 글자도 전부 fixedColors — 다크 모드에서
  // 테마 흰 글자가 밝은 워시 위에 얹히는 사고 방지 (RunMatchResultCard rowMe와 같은 페어링).
  fireWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixedColors.white,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    color: fixedColors.brandDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  helper: {
    color: fixedColors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  weekPill: {
    borderRadius: radii.pill,
    backgroundColor: fixedColors.brand,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
  },
  weekPillText: {
    color: fixedColors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
});
