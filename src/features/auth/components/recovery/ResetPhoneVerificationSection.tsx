import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// Render-only OTP block for the 비밀번호 재설정 card (P0-1). All state lives in the
// shared usePhoneVerificationForm hook (via useResetPasswordForm); this component
// only draws the request/verify controls and the verification error line. The JSX
// and styles are moved verbatim from AccountRecoveryScreen.

type ResetPhoneVerificationSectionProps = {
  code: string;
  error: string | null;
  isRequestingCode: boolean;
  isVerified: boolean;
  isVerifyingCode: boolean;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  phoneValid: boolean;
  requestId: string;
  resendCooldown: number;
};

export function ResetPhoneVerificationSection({
  code,
  error,
  isRequestingCode,
  isVerified,
  isVerifyingCode,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  phoneValid,
  requestId,
  resendCooldown,
}: ResetPhoneVerificationSectionProps) {
  return (
    <>
      {isVerified ? (
        <View style={styles.verifiedRow}>
          <Text style={styles.verifiedText}>휴대폰 인증 완료</Text>
        </View>
      ) : (
        <View style={styles.otpBlock}>
          <Pressable
            style={[
              styles.secondaryButton,
              (!phoneValid || isRequestingCode || resendCooldown > 0) ? styles.disabledButton : null,
            ]}
            onPress={onRequestCode}
            disabled={!phoneValid || isRequestingCode || resendCooldown > 0}
          >
            {isRequestingCode ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text style={styles.secondaryButtonText}>
                {resendCooldown > 0
                  ? `인증번호 다시 받기 (${resendCooldown}초)`
                  : requestId
                    ? '인증번호 다시 받기'
                    : '인증번호 받기'}
              </Text>
            )}
          </Pressable>

          {requestId ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>인증번호</Text>
                <TextInput
                  placeholder="문자로 받은 6자리"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={onCodeChange}
                  maxLength={6}
                />
              </View>
              <Pressable
                style={[
                  styles.secondaryButton,
                  (code.length !== 6 || isVerifyingCode) ? styles.disabledButton : null,
                ]}
                onPress={onVerifyCode}
                disabled={code.length !== 6 || isVerifyingCode}
              >
                {isVerifyingCode ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={styles.secondaryButtonText}>인증 확인</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </View>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );
}

// fieldGroup/label/input/disabledButton/errorText duplicate the screen's values so
// the extracted block renders pixel-identical without exporting the screen's sheet.
const styles = StyleSheet.create({
  fieldGroup: {
    gap: spacing.lg,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
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
  secondaryButton: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.brandLighter,
    borderRadius: radii.md,
    paddingVertical: spacing.s12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  otpBlock: {
    gap: spacing.s12,
  },
  verifiedRow: {
    paddingVertical: spacing.s10,
  },
  verifiedText: {
    color: colors.successText,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  disabledButton: {
    opacity: 0.7,
  },
  errorText: {
    color: colors.dangerBright,
    lineHeight: 19,
    fontSize: fontSizes.md,
  },
});
