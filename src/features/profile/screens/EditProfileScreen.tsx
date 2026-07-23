import { StyleSheet, Text, View, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  PUBLIC_TAG_CODE_MAX_LENGTH,
  PUBLIC_TAG_CODE_MIN_LENGTH,
  STATUS_MESSAGE_MAX_LENGTH,
  useEditProfile,
} from '@/features/profile/hooks/useEditProfile';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatRegionLabel } from '@/utils/regionLabel';

export default function EditProfileScreen() {
  const {
    displayName,
    error,
    handleSave,
    handleTagCodeChange,
    loading,
    profile,
    saved,
    saving,
    setDisplayName,
    setStatusMessage,
    statusMessage,
    tagCode,
  } = useEditProfile();

  return (
    <Screen>
      <AuthHeader
        title="프로필 수정"
        subtitle="랭킹과 친구 화면에 보이는 표시 이름과 기본 프로필 정보를 관리할 수 있어요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {!loading && profile ? (
        <Card>
          <View style={styles.form}>
            <Input label="표시 이름" value={displayName} onChangeText={setDisplayName} editable={!saving} />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>내 태그</Text>
              <View style={styles.tagRow}>
                <Text style={styles.tagPrefix}>#</Text>
                <TextInput
                  value={tagCode}
                  editable={!saving}
                  onChangeText={handleTagCodeChange}
                  style={styles.tagField}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={PUBLIC_TAG_CODE_MAX_LENGTH}
                  placeholder="ABC12"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <Text style={styles.helperText}>
                영문/숫자 {PUBLIC_TAG_CODE_MIN_LENGTH}~{PUBLIC_TAG_CODE_MAX_LENGTH}자 · 친구가 나를 찾을 때 쓰는 코드예요.
              </Text>
            </View>

            <Input label="대표 지역" value={formatRegionLabel(profile)} editable={false} />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>상태 메시지</Text>
              <TextInput
                value={statusMessage}
                editable={!saving}
                onChangeText={setStatusMessage}
                style={styles.input}
                maxLength={STATUS_MESSAGE_MAX_LENGTH}
                placeholder="러닝 경쟁 진행 중"
                placeholderTextColor={colors.textTertiary}
              />
              <Text style={styles.helperText}>{statusMessage.length}/{STATUS_MESSAGE_MAX_LENGTH}자</Text>
            </View>

            <PrimaryButton label={saving ? '저장 중...' : '저장하기'} onPress={handleSave} />
            <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
            {saved ? <Text style={styles.savedText}>프로필이 저장됐어요.</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </Card>
      ) : null}

      {!loading && !profile && error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Screen>
  );
}

function Input({
  label,
  value,
  editable = true,
  onChangeText,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        style={[styles.input, !editable && styles.disabledInput]}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  label: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.rank,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
  },
  tagPrefix: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
    marginRight: 2,
  },
  tagField: {
    flex: 1,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  disabledInput: {
    color: colors.textTertiary,
    backgroundColor: colors.surfaceMuted,
  },
  savedText: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
