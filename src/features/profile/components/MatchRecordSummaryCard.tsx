import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors } from '@/theme/tokens';

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
      <Pressable>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  matchRecordCard: {
    gap: 6,
  },
  matchRecordHeadline: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  matchRecordHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
