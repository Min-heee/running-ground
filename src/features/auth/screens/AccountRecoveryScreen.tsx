import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import {
  PASSWORD_RULE_DESCRIPTION,
  findUsernameByIdentity,
  getPasswordValidationError,
  normalizeUsername,
  resetPasswordByIdentity,
} from '@/lib/session';
import { getApiErrorMessage } from '@/services';
import { colors } from '@/theme/tokens';

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

  const passwordError = resetPassword ? getPasswordValidationError(resetPassword) : null;
  const passwordConfirmError = resetPasswordConfirm && resetPassword !== resetPasswordConfirm
    ? '비밀번호 확인이 일치하지 않아요.'
    : null;

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
            onChangeText={(nextValue) => setResetPhone(formatPhoneInput(nextValue))}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
          />
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
          <Pressable style={[styles.primaryButton, resetting ? styles.disabledButton : null]} onPress={handleResetPassword} disabled={resetting}>
            {resetting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>비밀번호 바꾸기</Text>}
          </Pressable>
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
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  form: {
    gap: 12,
    marginTop: 10,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontSize: 13,
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
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.7,
  },
  resultText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: colors.dangerBright,
    lineHeight: 19,
    fontSize: 13,
  },
});
