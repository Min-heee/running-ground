import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyProfileResponse } from '@/lib/api/types';
import { formatRegionLabel } from '@/utils/regionLabel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ProfileSummaryCardProps = {
  profile: MyProfileResponse;
  connectedSourceCount: number;
  tagShared: boolean;
  onShareTag: () => void;
};

export function ProfileSummaryCard({
  profile,
  connectedSourceCount,
  tagShared,
  onShareTag,
}: ProfileSummaryCardProps) {
  // Full hierarchy ("광주광역시 동구") — a bare 구 name is ambiguous nationwide.
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
      <Text style={styles.profileHint}>연결된 소스 {connectedSourceCount}개</Text>
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
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 99,
    backgroundColor: colors.inkPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
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
  profileHint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  inlineActionButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  inlineActionText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
});
