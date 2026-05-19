import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import type { AppNotice } from '@/domain';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type HomeNoticeCardProps = {
  notice: AppNotice;
};

export function HomeNoticeCard({ notice }: HomeNoticeCardProps) {
  return (
    <Card style={styles.noticeCard}>
      <Text style={styles.noticeLabel}>운영 공지</Text>
      <Text style={styles.noticeTitle}>{notice.title}</Text>
      <Text style={styles.noticeMessage}>{notice.message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  noticeCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.lg,
  },
  noticeLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  noticeTitle: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
  noticeMessage: {
    color: colors.border,
    lineHeight: 21,
  },
});
