import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyProfileResponse } from '@/lib/api/types';
import { formatRegionLabel } from '@/utils/regionLabel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ProfileSummaryCardProps = {
  profile: MyProfileResponse;
  tagShared: boolean;
  onShareTag: () => void;
};

export function ProfileSummaryCard({
  profile,
  tagShared,
  onShareTag,
}: ProfileSummaryCardProps) {
  // Full hierarchy ("전남광주통합특별시 동구") — a bare 구 name is ambiguous nationwide.
  const profileSubline = useMemo(
    () => formatRegionLabel(profile),
    [profile],
  );

  return (
    <Card style={styles.profileCard}>
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.name.slice(0, 1)}</Text>
        </View>
        <View style={styles.profileMeta}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.subline}>{profileSubline}</Text>
        </View>
      </View>
      <View style={styles.profileTagRow}>
        <Text style={styles.tagLabel}>공개 태그</Text>
        <Text style={styles.tag}>{profile.publicTag}</Text>
      </View>
      <View style={styles.inlineActions}>
        <Link href="/edit-profile" asChild>
          <Pressable style={styles.inlineActionButton}>
            <Text style={styles.inlineActionText}>프로필 수정</Text>
          </Pressable>
        </Link>
        <Pressable style={styles.inlineActionButton} onPress={onShareTag}>
          <Text style={styles.inlineActionText}>{tagShared ? '공유했어요' : '내 태그 공유'}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    gap: spacing.s12,
    paddingTop: spacing.s16,
    paddingBottom: spacing.s16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s14,
  },
  // 회색 원 + 글자 (오너 2026-09-18 '마이 정돈') — 선택색을 보라로 모은 뒤 탭에 남은 마지막 검은 덩어리였다.
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 99,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
  },
  profileMeta: {
    flex: 1,
    gap: spacing.sm,
  },
  name: {
    fontSize: 26,
    fontWeight: fontWeights.extraBold,
    color: colors.textHeading,
  },
  subline: {
    color: colors.textSecondary,
  },
  profileTagRow: {
    gap: spacing.sm,
  },
  tagLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  tag: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.button,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  // 회색 채움 (오너 2026-09-18 '마이 정돈') — 흰 카드 위 흰 버튼은 테두리로만 버티는 유령 버튼이었다.
  inlineActionButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  inlineActionText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
});
