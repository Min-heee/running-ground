import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyProfileResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type FriendTagCardProps = {
  profile: MyProfileResponse;
  copyMessage: string | null;
  onCopyTag: () => void;
};

export function FriendTagCard({ profile, copyMessage, onCopyTag }: FriendTagCardProps) {
  return (
    <Card style={styles.tagCard}>
      <View style={styles.tagHeaderRow}>
        <View style={styles.tagCopy}>
          <Text style={styles.tagTitle}>내 태그</Text>
          <Text style={styles.tagValue}>{profile.publicTag}</Text>
        </View>
        <Pressable style={styles.copyButton} onPress={onCopyTag}>
          <Text style={styles.copyButtonText}>복사</Text>
        </Pressable>
      </View>
      <Text style={styles.tagDescription}>친구 추가 화면에서 이 태그로 바로 검색할 수 있어.</Text>
      {copyMessage ? <Text style={styles.copyMessage}>{copyMessage}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tagCard: {
    gap: spacing.s10,
  },
  tagHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  tagCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  tagTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  tagValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: fontWeights.black,
    includeFontPadding: false,
  },
  tagDescription: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  copyButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s10,
  },
  copyButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  copyMessage: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
