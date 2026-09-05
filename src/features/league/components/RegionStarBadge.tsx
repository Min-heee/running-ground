import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 지역 이름 옆 월간 우승 ★ (오너 2026-09-05): 탭하면 어느 달 1등으로 받은 별인지
// 말풍선으로 설명한다 (홈 코치마크와 같은 브랜드 말풍선 문법). 말풍선은 카드 흐름
// 안(이름 아래)에 펼쳐진다 — 절대배치 오버레이는 그리드 카드/안드로이드 클리핑과
// 싸우게 되므로 쓰지 않는다. 다시 탭하거나 말풍선을 탭하면 닫힌다.

type RegionStarBadgeProps = {
  stars: number;
  // 우승 달 monthKey 목록 ('YYYY-MM', 정렬됨) — 구백엔드 응답엔 없을 수 있다.
  starMonths?: string[];
};

export function formatStarMonthsLabel(starMonths: string[]): string {
  const currentYear = new Date().getFullYear();
  const labels = starMonths
    .map((monthKey) => {
      const [yearText, monthText] = monthKey.split('-');
      const year = Number(yearText);
      const month = Number(monthText);

      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
      }

      return year === currentYear ? `${month}월` : `${year}년 ${month}월`;
    })
    .filter((label): label is string => label !== null);

  return labels.join('·');
}

export function formatStarCountText(stars: number): string {
  return stars <= 3 ? '★'.repeat(stars) : `★${stars}`;
}

function RegionStarBadgeImpl({ stars, starMonths }: RegionStarBadgeProps) {
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const monthsLabel = formatStarMonthsLabel(starMonths ?? []);
  const handleToggle = useCallback(() => {
    setBubbleOpen((current) => !current);
  }, []);
  const handleClose = useCallback(() => {
    setBubbleOpen(false);
  }, []);

  if (stars <= 0) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="우승 별 설명 보기"
        hitSlop={spacing.s10}
        onPress={monthsLabel ? handleToggle : undefined}
      >
        <Text style={styles.stars}>{formatStarCountText(stars)}</Text>
      </Pressable>
      {bubbleOpen && monthsLabel ? (
        <View style={styles.bubbleWrap}>
          <View style={styles.arrow} />
          <Pressable accessibilityRole="button" accessibilityLabel="우승 별 설명 닫기" onPress={handleClose} style={styles.bubble}>
            <Text style={styles.bubbleText}>{monthsLabel} 랭킹 1등으로 받은 별이에요</Text>
            <Text style={styles.bubbleSubText}>눌러서 닫기</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

export const RegionStarBadge = memo(RegionStarBadgeImpl);

const ARROW_HALF_WIDTH = 7;

const styles = StyleSheet.create({
  stars: {
    color: colors.podiumGold,
    fontWeight: fontWeights.extraBold,
  },
  // 말풍선은 부모가 flexWrap 행일 때 줄바꿈으로 전폭을 차지하도록 width 100%.
  bubbleWrap: {
    width: '100%',
    alignItems: 'flex-start',
  },
  arrow: {
    borderBottomColor: colors.brand,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderLeftWidth: ARROW_HALF_WIDTH,
    borderRightColor: 'transparent',
    borderRightWidth: ARROW_HALF_WIDTH,
    height: 0,
    width: 0,
    marginLeft: spacing.s12,
  },
  bubble: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    alignSelf: 'stretch',
  },
  bubbleText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    lineHeight: 18,
  },
  bubbleSubText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    marginTop: spacing.xs,
    opacity: 0.8,
  },
});
