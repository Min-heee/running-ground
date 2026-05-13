import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import type { AppNotice } from '@/domain';

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
    backgroundColor: '#111827',
    gap: 6,
  },
  noticeLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  noticeMessage: {
    color: '#D0D5DD',
    lineHeight: 21,
  },
});
