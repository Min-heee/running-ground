import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// 크루 히어로 — 카드 없이 맨바닥에 앉는다 (기록 탭 기간 블록의 히어로와 같은 값: 라벨 13/800,
// 큰 숫자 heroLarge/900, 메타 14/600). 한 화면의 큰 숫자는 이것 하나 — 순위('3위' / '순위 밖').
// 보정 전 인당 평균은 여기에도 없다: 큰 숫자 아래 메타는 늘 '보정 인당 …km'.

export const CrewHero = memo(function CrewHero({
  label,
  value,
  meta,
  note,
}: {
  label: string;
  value?: string | null;
  meta?: string | null;
  note?: string | null;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  hero: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSizes.heroLarge,
    fontWeight: fontWeights.black,
    lineHeight: fontSizes.heroLarge + 6,
    includeFontPadding: false,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
