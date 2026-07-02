import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { HomeNoticeCard } from '@/features/home/components/HomeNoticeCard';
import type { AppNotice } from '@/domain';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type AnnouncementListProps = {
  error: string | null;
  loading: boolean;
  notices: AppNotice[];
};

export const AnnouncementList = memo(function AnnouncementList({
  error,
  loading,
  notices,
}: AnnouncementListProps) {
  if (loading) {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  if (!notices.length) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>새 공지사항이 없어요.</Text>
        <Text style={styles.emptyText}>중요한 운영 소식이 생기면 이곳에 모아둘게요.</Text>
      </Card>
    );
  }

  return (
    <>
      {notices.map((notice) => (
        <HomeNoticeCard key={notice.id} notice={notice} />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  emptyCard: {
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
});
