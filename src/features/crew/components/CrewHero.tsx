import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// 크루 히어로 — 카드 없이 맨바닥에 앉는다 (기록 탭 기간 블록의 히어로와 같은 값: 라벨 13/800,
// 큰 숫자 heroLarge/900, 메타 14/600). 한 화면의 큰 숫자는 이것 하나 — 순위('3위' / '순위 밖').
// 큰 숫자 아래 메타는 늘 '인당 …km'(총거리 ÷ 시즌 멤버, 오너 2026-09-19).

// valueChange: 큰 순위 옆 '어제보다 ▲▼' 한 마디(오너 2026-09-19) — 오르면 보라, 내리면 회색.
export const CrewHero = memo(function CrewHero({
  label,
  value,
  valueChange,
  meta,
  note,
}: {
  label: string;
  value?: string | null;
  valueChange?: { text: string; tone: 'up' | 'down' } | null;
  meta?: string | null;
  note?: string | null;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {value && valueChange ? (
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          <Text style={[styles.valueChange, valueChange.tone === 'up' ? styles.valueChangeUp : null]}>
            {valueChange.text}
          </Text>
        </View>
      ) : null}
      {value && !valueChange ? <Text style={styles.value}>{value}</Text> : null}
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
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  valueChange: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  valueChangeUp: {
    color: colors.brandStrong,
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
