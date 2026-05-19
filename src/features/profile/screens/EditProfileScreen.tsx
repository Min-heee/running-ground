import { StyleSheet, Text, View, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { type Href, Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useEditProfile } from '@/features/profile/hooks/useEditProfile';
import { colors } from '@/theme/tokens';

export default function EditProfileScreen() {
  const universityVerificationHref = '/university-verification' as Href;
  const {
    displayName,
    error,
    handleSave,
    loading,
    profile,
    saved,
    saving,
    setDisplayName,
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
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>대학교 인증</Text>
              <Text style={styles.helperText}>
                소속 대학은 직접 입력 대신 마이페이지에서 재학증명서나 에브리타임 같은 인증 방식으로 연결할 수 있게 바꿀 예정이에요.
              </Text>
              <Link href={universityVerificationHref} asChild>
                <Pressable style={styles.inlineLinkButton}>
                  <Text style={styles.inlineLinkButtonText}>대학교 인증 안내 보기</Text>
                </Pressable>
              </Link>
            </View>
            <Input label="내 태그" value={profile.publicTag} editable={false} />
            <Input label="대표 지역" value={profile.districtName} editable={false} />
            <Input label="상태 메시지" value="러닝 경쟁 진행 중" editable={false} />
            <PrimaryButton label={saving ? '저장 중...' : '저장하기'} onPress={handleSave} />
            <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
            {saved ? <Text style={styles.savedText}>프로필이 저장됐어.</Text> : null}
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
  noticeCard: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  noticeTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  inlineLinkButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineLinkButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
  },
  disabledInput: {
    color: colors.textTertiary,
    backgroundColor: colors.surfaceMuted,
  },
  savedText: {
    color: colors.successText,
    fontWeight: '700',
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 20,
  },
});
