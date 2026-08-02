// 마이탭 포인트 카드 (오너 2026-08-02: "포인트를 주는데 어디에도 안 보인다").
// 큰 숫자 = 보유 포인트(마켓에서 쓸 수 있는 값, 적립 − 사용), 아래 줄에 이번 달/누적 적립.

import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyProfileResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ProfilePointsCardProps = {
  profile: MyProfileResponse;
};

function formatPoints(value: number | undefined) {
  return `${Math.max(0, Math.round(value ?? 0)).toLocaleString()}P`;
}

export function ProfilePointsCard({ profile }: ProfilePointsCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>포인트</Text>

      <View>
        <Text style={styles.heroValue}>
          {formatPoints(profile.availablePoints ?? profile.totalPoints)}
        </Text>
        <Text style={styles.heroLabel}>보유 포인트</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>이번 달 적립</Text>
        <Text style={styles.detailValue}>+{formatPoints(profile.currentMonthPoints)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>누적 적립</Text>
        <Text style={styles.detailValue}>{formatPoints(profile.totalPoints)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s10,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  detailValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
});
