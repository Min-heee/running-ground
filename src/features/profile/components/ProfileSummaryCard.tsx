import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyProfileResponse } from '@/lib/api/types';

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
  const profileSubline = useMemo(
    () => [profile.districtName, profile.universityName].filter(Boolean).join(' · ') || '대학교 인증 전',
    [profile.districtName, profile.universityName],
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
          <Text style={styles.inlineActionText}>{tagShared ? '복사 준비됨' : '내 태그 공유'}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    gap: 12,
    paddingTop: 16,
    paddingBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 99,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  profileMeta: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#101828',
  },
  subline: {
    color: '#667085',
  },
  profileTagRow: {
    gap: 4,
  },
  tagLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  tag: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  profileHint: {
    fontSize: 12,
    color: '#667085',
    fontWeight: '700',
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineActionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  inlineActionText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 12,
  },
});
