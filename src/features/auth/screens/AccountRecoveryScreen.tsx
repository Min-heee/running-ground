import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import {
  PASSWORD_RULE_DESCRIPTION,
  findUsernameByIdentity,
  getPasswordValidationError,
  normalizeUsername,
  requestResetPhoneVerification,
  resetPasswordByIdentity,
  verifyResetPhoneCode,
} from '@/lib/session';
import { getApiErrorMessage } from '@/services';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function AccountRecoveryScreen() {
  const [findName, setFindName] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [findBirthDate, setFindBirthDate] = useState('');
  const [foundUsername, setFoundUsername] = useState<string | null>(null);
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  const [resetUsername, setResetUsername] = useState('');
  const [resetName, setResetName] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetBirthDate, setResetBirthDate] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Reset-password phone verification (P0-1): the backend requires a verified
  // 'reset' phone token, so the form must send an OTP-verified token before it can
  // change the password. Mirrors the signup phone-verify UX.
  const [resetPhoneRequestId, setResetPhoneRequestId] = useState('');
  const [resetPhoneCode, setResetPhoneCode] = useState('');
  const [resetPhoneToken, setResetPhoneToken] = useState('');
  const [isResetPhoneVerified, setIsResetPhoneVerified] = useState(false);
  const [isRequestingResetCode, setIsRequestingResetCode] = useState(false);
  const [isVerifyingResetCode, setIsVerifyingResetCode] = useState(false);
  const [resetPhoneError, setResetPhoneError] = useState<string | null>(null);
  const [resetResendCooldown, setResetResendCooldown] = useState(0);
  const resetCooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const passwordError = resetPassword ? getPasswordValidationError(resetPassword) : null;
  const passwordConfirmError = resetPasswordConfirm && resetPassword !== resetPasswordConfirm
    ? '비밀번호 확인이 일치하지 않아요.'
    : null;

  const resetPhoneDigits = resetPhone.replace(/\D/g, '');
  const resetPhoneValid = resetPhoneDigits.length >= 10;

  useEffect(() => () => {
    if (resetCooldownTimerRef.current) {
      clearInterval(resetCooldownTimerRef.current);
    }
  }, []);

  const startResetResendCooldown = useCallback((resendAvailableAt?: string) => {
    if (resetCooldownTimerRef.current) {
      clearInterval(resetCooldownTimerRef.current);
    }

    const parsedResendMs = resendAvailableAt ? new Date(resendAvailableAt).getTime() : Number.NaN;
    const initialSeconds = Number.isFinite(parsedResendMs)
      ? Math.max(0, Math.ceil((parsedResendMs - Date.now()) / 1000))
      : 60;

    setResetResendCooldown(initialSeconds);

    if (initialSeconds <= 0) {
      return;
    }

    resetCooldownTimerRef.current = setInterval(() => {
      setResetResendCooldown((current) => {
        if (current <= 1) {
          if (resetCooldownTimerRef.current) {
            clearInterval(resetCooldownTimerRef.current);
            resetCooldownTimerRef.current = null;
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  // Any change to the reset phone number invalidates a prior verification — the
  // token is bound to the number that was verified.
  const clearResetPhoneVerification = useCallback(() => {
    if (resetCooldownTimerRef.current) {
      clearInterval(resetCooldownTimerRef.current);
      resetCooldownTimerRef.current = null;
    }
    setResetPhoneRequestId('');
    setResetPhoneCode('');
    setResetPhoneToken('');
    setIsResetPhoneVerified(false);
    setResetPhoneError(null);
    setResetResendCooldown(0);
  }, []);

  const handleResetPhoneChange = (nextValue: string) => {
    const formattedPhone = formatPhoneInput(nextValue);
    setResetPhone((currentPhone) => {
      if (formattedPhone !== currentPhone) {
        clearResetPhoneVerification();
      }
      return formattedPhone;
    });
  };

  const handleRequestResetCode = async () => {
    if (!resetPhoneValid || isRequestingResetCode || resetResendCooldown > 0) {
      return;
    }

    setResetPhoneError(null);
    setIsRequestingResetCode(true);

    try {
      const result = await requestResetPhoneVerification(resetPhone);
      setResetPhoneRequestId(result.requestId);
      setResetPhoneCode('');
      setResetPhoneToken('');
      setIsResetPhoneVerified(false);
      startResetResendCooldown(result.resendAvailableAt);
    } catch (requestError) {
      setResetPhoneError(getApiErrorMessage(requestError, '인증번호 발송에 실패했어요.'));
    } finally {
      setIsRequestingResetCode(false);
    }
  };

  const handleResetPhoneCodeChange = (nextValue: string) => {
    setResetPhoneCode(nextValue.replace(/\D/g, '').slice(0, 6));
    setResetPhoneError(null);
  };

  const handleVerifyResetCode = async () => {
    if (!resetPhoneRequestId || resetPhoneCode.length !== 6 || isVerifyingResetCode) {
      return;
    }

    setResetPhoneError(null);
    setIsVerifyingResetCode(true);

    try {
      const result = await verifyResetPhoneCode(resetPhoneRequestId, resetPhoneCode);
      setResetPhoneToken(result.verifiedToken);
      setIsResetPhoneVerified(true);

      if (resetCooldownTimerRef.current) {
        clearInterval(resetCooldownTimerRef.current);
        resetCooldownTimerRef.current = null;
      }
      setResetResendCooldown(0);
    } catch (verifyError) {
      setResetPhoneError(getApiErrorMessage(verifyError, '인증번호 확인에 실패했어요.'));
    } finally {
      setIsVerifyingResetCode(false);
    }
  };

  const handleFindUsername = async () => {
    setFindMessage(null);
    setFoundUsername(null);
    setFinding(true);

    try {
      const result = await findUsernameByIdentity({
        realName: findName,
        phone: findPhone,
        birthDate: findBirthDate,
      });
      setFoundUsername(result.username);
      setFindMessage(`${result.maskedPhone} 정보로 가입된 아이디를 찾았어요.`);
      setResetUsername(result.username);
      setResetName(findName.trim());
      // Prefilling the reset phone can change the number a prior OTP was bound to,
      // so drop any existing reset verification to force a fresh one.
      clearResetPhoneVerification();
      setResetPhone(findPhone);
      setResetBirthDate(findBirthDate);
    } catch (error) {
      setFindMessage(getApiErrorMessage(error, '아이디를 찾지 못했어요.'));
    } finally {
      setFinding(false);
    }
  };

  const handleResetPassword = async () => {
    setResetMessage(null);

    if (!isResetPhoneVerified || !resetPhoneToken) {
      setResetMessage('휴대폰 인증을 먼저 완료해주세요.');
      return;
    }

    if (passwordError) {
      setResetMessage(passwordError);
      return;
    }

    if (passwordConfirmError) {
      setResetMessage(passwordConfirmError);
      return;
    }

    setResetting(true);

    try {
      const result = await resetPasswordByIdentity({
        username: normalizeUsername(resetUsername),
        realName: resetName,
        phone: resetPhone,
        birthDate: resetBirthDate,
        newPassword: resetPassword,
        phoneVerificationToken: resetPhoneToken,
      });
      setResetMessage(result.message);
      setResetPassword('');
      setResetPasswordConfirm('');
    } catch (error) {
      setResetMessage(getApiErrorMessage(error, '비밀번호를 재설정하지 못했어요.'));
    } finally {
      setResetting(false);
    }
  };

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
          <Field label="이름" value={findName} onChangeText={setFindName} placeholder="이름을 입력하세요" />
          <Field
            label="휴대폰 번호"
            value={findPhone}
            onChangeText={(nextValue) => setFindPhone(formatPhoneInput(nextValue))}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
          />
          <Field
            label="생년월일"
            value={findBirthDate}
            onChangeText={(nextValue) => setFindBirthDate(formatBirthDateInput(nextValue))}
            placeholder="1990-01-01"
          />
          <Pressable style={[styles.primaryButton, finding ? styles.disabledButton : null]} onPress={handleFindUsername} disabled={finding}>
            {finding ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>아이디 찾기</Text>}
          </Pressable>
          {foundUsername ? <Text style={styles.resultText}>가입된 아이디: {foundUsername}</Text> : null}
          {findMessage ? <Text style={styles.helperText}>{findMessage}</Text> : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>비밀번호 재설정</Text>
        <View style={styles.form}>
          <Field
            label="아이디"
            value={resetUsername}
            onChangeText={(nextValue) => setResetUsername(nextValue.trim().toLowerCase())}
            placeholder="아이디를 입력하세요"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field label="이름" value={resetName} onChangeText={setResetName} placeholder="이름을 입력하세요" />
          <Field
            label="휴대폰 번호"
            value={resetPhone}
            onChangeText={handleResetPhoneChange}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
          />

          {isResetPhoneVerified ? (
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedText}>휴대폰 인증 완료</Text>
            </View>
          ) : (
            <View style={styles.otpBlock}>
              <Pressable
                style={[
                  styles.secondaryButton,
                  (!resetPhoneValid || isRequestingResetCode || resetResendCooldown > 0) ? styles.disabledButton : null,
                ]}
                onPress={handleRequestResetCode}
                disabled={!resetPhoneValid || isRequestingResetCode || resetResendCooldown > 0}
              >
                {isRequestingResetCode ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {resetResendCooldown > 0
                      ? `인증번호 다시 받기 (${resetResendCooldown}초)`
                      : resetPhoneRequestId
                        ? '인증번호 다시 받기'
                        : '인증번호 받기'}
                  </Text>
                )}
              </Pressable>

              {resetPhoneRequestId ? (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>인증번호</Text>
                    <TextInput
                      placeholder="문자로 받은 6자리"
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                      keyboardType="number-pad"
                      value={resetPhoneCode}
                      onChangeText={handleResetPhoneCodeChange}
                      maxLength={6}
                    />
                  </View>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      (resetPhoneCode.length !== 6 || isVerifyingResetCode) ? styles.disabledButton : null,
                    ]}
                    onPress={handleVerifyResetCode}
                    disabled={resetPhoneCode.length !== 6 || isVerifyingResetCode}
                  >
                    {isVerifyingResetCode ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Text style={styles.secondaryButtonText}>인증 확인</Text>
                    )}
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
          {resetPhoneError ? <Text style={styles.errorText}>{resetPhoneError}</Text> : null}

          <Field
            label="생년월일"
            value={resetBirthDate}
            onChangeText={(nextValue) => setResetBirthDate(formatBirthDateInput(nextValue))}
            placeholder="1990-01-01"
          />
          <Field
            label="새 비밀번호"
            value={resetPassword}
            onChangeText={setResetPassword}
            placeholder="새 비밀번호를 입력하세요"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            helperText={PASSWORD_RULE_DESCRIPTION}
          />
          <Field
            label="새 비밀번호 확인"
            value={resetPasswordConfirm}
            onChangeText={setResetPasswordConfirm}
            placeholder="한 번 더 입력하세요"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          {passwordConfirmError ? <Text style={styles.errorText}>{passwordConfirmError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, (resetting || !isResetPhoneVerified) ? styles.disabledButton : null]}
            onPress={handleResetPassword}
            disabled={resetting || !isResetPhoneVerified}
          >
            {resetting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>비밀번호 바꾸기</Text>}
          </Pressable>
          {!isResetPhoneVerified ? (
            <Text style={styles.helperText}>휴대폰 인증을 완료하면 비밀번호를 바꿀 수 있어요.</Text>
          ) : null}
          {resetMessage ? <Text style={styles.helperText}>{resetMessage}</Text> : null}
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
