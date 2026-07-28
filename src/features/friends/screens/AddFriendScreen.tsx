import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { useAddFriendScreen } from '@/features/friends/hooks/useAddFriendScreen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function AddFriendScreen() {
  // 공유 링크 딥링크(runningground://add-friend?tag=CODE)로 진입하면 태그가 실려 온다.
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const {
    added,
    copied,
    error,
    friendTag,
    handleAddFriend,
    handleCopy,
    handleFriendTagChange,
    loading,
    profile,
    requestCounts,
    submitting,
  } = useAddFriendScreen({ deepLinkTag: Array.isArray(tag) ? tag[0] : tag });

  return (
    <Screen>
      <AuthHeader
        title="친구 추가하기"
        subtitle="친구 태그로 검색해서 서로의 기록과 순위를 비교할 수 있어요."
        showBack
        backHref="/(tabs)/friends"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {!loading && profile ? (
        <Card>
          <Text style={styles.sectionTitle}>내 태그</Text>
          <View style={styles.tagBox}>
            <Text style={styles.tag}>{profile.publicTag}</Text>
            <Text style={styles.tagHint}>친구에게 이 태그를 공유하면 바로 추가할 수 있어요.</Text>
            <Pressable style={styles.copyButton} onPress={handleCopy}>
              <Text style={styles.copyButtonText}>{copied ? '복사됨' : '태그 복사하기'}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>친구 요청 현황</Text>
        <Text style={styles.statusText}>보낸 요청 {requestCounts.pendingCount}건 · 받은 요청 {requestCounts.receivedCount}건</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>친구 태그 입력</Text>
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>#</Text>
            <TextInput
              placeholder="예: AB7K2"
              placeholderTextColor={colors.textTertiary}
              style={styles.inputField}
              autoCapitalize="characters"
              autoCorrect={false}
              value={friendTag}
              onChangeText={handleFriendTagChange}
              editable={!submitting}
            />
          </View>
          <PrimaryButton label={submitting ? '친구 요청 보내는 중...' : '친구 요청 보내기'} onPress={handleAddFriend} />
          {friendTag.length > 0 ? <Text style={styles.helperText}>입력된 태그: #{friendTag}</Text> : null}
          {added ? <Text style={styles.successText}>친구 요청을 보냈어요. 상대가 수락하면 친구 랭킹에 함께 보여줄 수 있어요.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>

      <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  tagBox: {
    backgroundColor: colors.purpleRow,
    borderRadius: radii.lg,
    padding: spacing.s16,
    gap: spacing.xxl,
    marginTop: spacing.xxl,
  },
  tag: {
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
    color: colors.brand,
  },
  tagHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  copyButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    borderWidth: 1,
    borderColor: colors.purpleBorder,
  },
  copyButtonText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  statusText: {
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: spacing.xxl,
  },
  form: {
    gap: spacing.s12,
    marginTop: spacing.xxl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
  },
  inputPrefix: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
    marginRight: 2,
  },
  inputField: {
    flex: 1,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  successText: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
