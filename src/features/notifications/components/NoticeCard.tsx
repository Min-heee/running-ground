import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import type { AppNotice } from '@/domain';
import { colors, fixedColors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type NoticeCardProps = {
  notice: AppNotice;
};

// 공지는 알림센터의 '공지사항' 탭에서만 보여준다 (오너 2026-07-31: 홈 랭크 카드 위에
// 끼어들지 않게). 홈에서 쓰지 않으므로 카드도 알림센터 쪽에 둔다.
export function NoticeCard({ notice }: NoticeCardProps) {
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
    backgroundColor: fixedColors.textPrimary,
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
    color: fixedColors.border,
    lineHeight: 21,
  },
});
