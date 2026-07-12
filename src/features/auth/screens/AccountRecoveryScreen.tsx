import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PASSWORD_RULE_DESCRIPTION } from '@/lib/session';
import { useFindUsernameForm } from '@/features/auth/hooks/useFindUsernameForm';
import { useResetPasswordForm } from '@/features/auth/hooks/useResetPasswordForm';
import { ResetPhoneVerificationSection } from '@/features/auth/components/recovery/ResetPhoneVerificationSection';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// Layout-only screen: the 아이디 찾기 / 비밀번호 재설정 flow state lives in
// useFindUsernameForm / useResetPasswordForm, and the OTP block renders through
// ResetPhoneVerificationSection on top of the shared phone-verification hook.

export default function AccountRecoveryScreen() {
  const resetForm = useResetPasswordForm();
  const findForm = useFindUsernameForm({ onFound: resetForm.prefillFromFoundIdentity });
  const resetPhoneVerification = resetForm.phoneVerification;

  return (
    <Screen>
      <AuthHeader
        title="아이디/비밀번호 찾기"
        subtitle="이름, 휴대폰 번호, 생년월일로 계정을 확인할게요."
        showBack
        backHref="/login"
      />

      <Card>
        <Text style={styles.sectionTitle}>아이디 찾기</Text>
        <View style={styles.form}>
          <Field label="이름" value={findForm.findName} onChangeText={findForm.setFindName} placeholder="이름을 입력하세요" />
          <Field
            label="휴대폰 번호"
            value={findForm.findPhone}
            onChangeText={findForm.handleFindPhoneChange}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
          />
          <Field
            label="생년월일"
            value={findForm.findBirthDate}
            onChangeText={findForm.handleFindBirthDateChange}
            placeholder="1990-01-01"
          />
          <Pressable
            style={[styles.primaryButton, findForm.finding ? styles.disabledButton : null]}
            onPress={findForm.handleFindUsername}
            disabled={findForm.finding}
          >
            {findForm.finding ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>아이디 찾기</Text>}
          </Pressable>
          {findForm.foundUsername ? <Text style={styles.resultText}>가입된 아이디: {findForm.foundUsername}</Text> : null}
          {findForm.findMessage ? <Text style={styles.helperText}>{findForm.findMessage}</Text> : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>비밀번호 재설정</Text>
        <View style={styles.form}>
          <Field
            label="아이디"
            value={resetForm.resetUsername}
            onChangeText={resetForm.handleResetUsernameChange}
            placeholder="아이디를 입력하세요"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field label="이름" value={resetForm.resetName} onChangeText={resetForm.setResetName} placeholder="이름을 입력하세요" />
          <Field
            label="휴대폰 번호"
            value={resetForm.resetPhone}
            onChangeText={resetForm.handleResetPhoneChange}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
          />

          <ResetPhoneVerificationSection
            code={resetPhoneVerification.code}
            error={resetPhoneVerification.error}
            isRequestingCode={resetPhoneVerification.isRequestingCode}
            isVerified={resetPhoneVerification.isVerified}
            isVerifyingCode={resetPhoneVerification.isVerifyingCode}
            onCodeChange={resetPhoneVerification.handleCodeChange}
            onRequestCode={resetPhoneVerification.handleRequestCode}
            onVerifyCode={resetPhoneVerification.handleVerifyCode}
            phoneValid={resetPhoneVerification.phoneValid}
            requestId={resetPhoneVerification.requestId}
            resendCooldown={resetPhoneVerification.resendCooldown}
          />

          <Field
            label="생년월일"
            value={resetForm.resetBirthDate}
            onChangeText={resetForm.handleResetBirthDateChange}
            placeholder="1990-01-01"
          />
          <Field
            label="새 비밀번호"
            value={resetForm.resetPassword}
            onChangeText={resetForm.setResetPassword}
            placeholder="새 비밀번호를 입력하세요"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            helperText={PASSWORD_RULE_DESCRIPTION}
          />
          <Field
            label="새 비밀번호 확인"
            value={resetForm.resetPasswordConfirm}
            onChangeText={resetForm.setResetPasswordConfirm}
            placeholder="한 번 더 입력하세요"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {resetForm.passwordError ? <Text style={styles.errorText}>{resetForm.passwordError}</Text> : null}
          {resetForm.passwordConfirmError ? <Text style={styles.errorText}>{resetForm.passwordConfirmError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, (resetForm.resetting || !resetPhoneVerification.isVerified) ? styles.disabledButton : null]}
            onPress={resetForm.handleResetPassword}
            disabled={resetForm.resetting || !resetPhoneVerification.isVerified}
          >
            {resetForm.resetting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>비밀번호 바꾸기</Text>}
          </Pressable>
          {!resetPhoneVerification.isVerified ? (
            <Text style={styles.helperText}>휴대폰 인증을 완료하면 비밀번호를 바꿀 수 있어요.</Text>
          ) : null}
          {resetForm.resetMessage ? <Text style={styles.helperText}>{resetForm.resetMessage}</Text> : null}
        </View>
      </Card>
    </Screen>
  );
}

function Field({
  label,
  helperText,
  ...props
}: {
  label: string;
  helperText?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  form: {
    gap: spacing.s12,
    marginTop: spacing.s10,
  },
  fieldGroup: {
    gap: spacing.lg,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontSize: fontSizes.md,
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
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  disabledButton: {
    opacity: 0.7,
  },
  resultText: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.dangerBright,
    lineHeight: 19,
    fontSize: fontSizes.md,
  },
});
