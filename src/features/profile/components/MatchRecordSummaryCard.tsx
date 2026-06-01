import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type MatchRecordSummaryCardProps = {
  href: Href;
  totalCount: number;
  duelCount: number;
  groupCount: number;
};

export function MatchRecordSummaryCard({
  href,
  totalCount,
  duelCount,
  groupCount,
}: MatchRecordSummaryCardProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.matchRecordPressable}>
        <Card style={styles.matchRecordCard}>
          <View style={styles.sectionHeaderRow}>
            <SectionTitle>전적 보기</SectionTitle>
            <Text style={styles.sectionLink}>열기</Text>
          </View>
          <Text style={styles.matchRecordHeadline}>{totalCount}번 대결했어요</Text>
          <Text style={styles.matchRecordHint}>
            1대1 {duelCount}전 · 그룹 {groupCount}전
          </Text>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  matchRecordPressable: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  matchRecordCard: {
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  matchRecordHeadline: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  matchRecordHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
