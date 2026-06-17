import { useCallback, useMemo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { PASSWORD_RULE_DESCRIPTION, USERNAME_RULE_DESCRIPTION } from '@/lib/session';
import { ValidationItem } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';
import { colors } from '@/theme/tokens';

type SignupCredentialsSectionProps = Pick<
  SignupFormModel,
  | 'checkingUsername'
  | 'handleCheckUsername'
  | 'handlePhoneChange'
  | 'handlePhoneVerificationCodeChange'
  | 'handleRequestPhoneCode'
  | 'handleUsernameChange'
  | 'handleVerifyPhoneCode'
  | 'isPhoneVerified'
  | 'isRequestingPhoneCode'
  | 'isVerifyingPhoneCode'
  | 'password'
  | 'passwordConfirm'
  | 'passwordConfirmMessage'
  | 'passwordReady'
  | 'passwordValidationMessage'
  | 'passwordVisible'
  | 'phone'
  | 'phoneResendCooldown'
  | 'phoneValid'
  | 'phoneVerificationCode'
  | 'phoneVerificationError'
  | 'phoneVerificationRequestId'
  | 'setPassword'
  | 'setPasswordConfirm'
  | 'setPasswordVisible'
  | 'submitting'
  | 'username'
  | 'usernameCheck'
  | 'usernameReady'
  | 'usernameValidationMessage'
>;

const ERROR_STATUS_TEXT_STYLE = [styles.statusText, styles.statusTextError];

export function SignupCredentialsSection({
  checkingUsername,
  handleCheckUsername,
  handlePhoneChange,
  handlePhoneVerificationCodeChange,
  handleRequestPhoneCode,
  handleUsernameChange,
  handleVerifyPhoneCode,
  isPhoneVerified,
  isRequestingPhoneCode,
  isVerifyingPhoneCode,
  password,
  passwordConfirm,
  passwordConfirmMessage,
  passwordReady,
  passwordValidationMessage,
  passwordVisible,
  phone,
  phoneResendCooldown,
  phoneValid,
  phoneVerificationCode,
  phoneVerificationError,
  phoneVerificationRequestId,
  setPassword,
  setPasswordConfirm,
  setPasswordVisible,
  submitting,
  username,
  usernameCheck,
  usernameReady,
  usernameValidationMessage,
}: SignupCredentialsSectionProps) {
  const usernameInputEditable = !submitting && !checkingUsername;
  const phoneInputEditable = !submitting && !isPhoneVerified;
  const phoneInputStyle = useMemo(
    () => [styles.input, styles.inlineInput, phoneInputEditable ? null : styles.inputDisabled],
    [phoneInputEditable],
  );
  const phoneCooldownActive = phoneResendCooldown > 0;
  const requestButtonDisabled = submitting || !phoneValid || isRequestingPhoneCode || phoneCooldownActive;
  const requestButtonStyle = useMemo(
    () => [styles.secondaryActionButton, requestButtonDisabled && styles.disabledButton],
    [requestButtonDisabled],
  );
  const hasRequestedPhoneCode = Boolean(phoneVerificationRequestId);
  const codeInputEditable = !submitting && !isVerifyingPhoneCode;
  const codeInputStyle = useMemo(
    () => [styles.input, styles.inlineInput, codeInputEditable ? null : styles.inputDisabled],
    [codeInputEditable],
  );
  const verifyButtonDisabled = submitting || phoneVerificationCode.length !== 6 || isVerifyingPhoneCode;
  const verifyButtonStyle = useMemo(
    () => [styles.secondaryActionButton, verifyButtonDisabled && styles.disabledButton],
    [verifyButtonDisabled],
  );
  const requestButtonLabel = isRequestingPhoneCode
    ? '발송 중'
    : phoneCooldownActive
      ? `${phoneResendCooldown}초 후 재발송`
      : hasRequestedPhoneCode
        ? '재발송'
        : '인증번호 발송';
  const usernameInputStyle = useMemo(
    () => [styles.input, styles.inlineInput, usernameInputEditable ? null : styles.inputDisabled],
    [usernameInputEditable],
  );
  const usernameCheckButtonStyle = useMemo(
    () => [styles.secondaryActionButton, (submitting || checkingUsername) && styles.disabledButton],
    [checkingUsername, submitting],
  );
  const usernameCheckStatusStyle = useMemo(
    () => [
      styles.statusText,
      usernameCheck.status === 'available'
        ? styles.statusTextSuccess
        : usernameCheck.status === 'checking'
          ? styles.statusTextNeutral
          : styles.statusTextError,
    ],
    [usernameCheck.status],
  );
  const passwordInputStyle = useMemo(() => [styles.input, submitting && styles.inputDisabled], [submitting]);
  const handleTogglePasswordVisible = useCallback(() => {
    setPasswordVisible((current) => !current);
  }, [setPasswordVisible]);

  return (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>아이디</Text>
        <Text style={styles.helperText}>{USERNAME_RULE_DESCRIPTION} 입력 후 중복 확인을 해주세요.</Text>
        <View style={styles.inlineInputRow}>
          <TextInput
            placeholder="아이디를 입력하세요"
            placeholderTextColor={colors.textTertiary}
            style={usernameInputStyle}
            value={username}
            onChangeText={handleUsernameChange}
            editable={usernameInputEditable}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={usernameCheckButtonStyle}
            onPress={handleCheckUsername}
            disabled={submitting || checkingUsername}
          >
            <Text style={styles.secondaryActionButtonText}>{checkingUsername ? '확인 중' : usernameReady ? '사용 가능' : '중복 확인'}</Text>
          </Pressable>
        </View>
        {usernameValidationMessage ? <Text style={ERROR_STATUS_TEXT_STYLE}>{usernameValidationMessage}</Text> : null}
        {usernameCheck.message ? (
          <Text style={usernameCheckStatusStyle}>
            {usernameCheck.message}
          </Text>
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>비밀번호</Text>
          <Pressable onPress={handleTogglePasswordVisible} disabled={submitting}>
            <Text style={styles.inlineToggleText}>{passwordVisible ? '숨김' : '보기'}</Text>
          </Pressable>
        </View>
        <Text style={styles.helperText}>{PASSWORD_RULE_DESCRIPTION}</Text>
        <TextInput
          placeholder="비밀번호를 입력하세요"
          placeholderTextColor={colors.textTertiary}
          style={passwordInputStyle}
          secureTextEntry={!passwordVisible}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          placeholder="비밀번호를 한 번 더 입력하세요"
          placeholderTextColor={colors.textTertiary}
          style={passwordInputStyle}
          secureTextEntry={!passwordVisible}
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.validationList}>
          <ValidationItem label="8자 이상" complete={password.length >= 8} />
          <ValidationItem label="영문과 숫자 포함" complete={/[A-Za-z]/.test(password) && /\d/.test(password)} />
          <ValidationItem label="비밀번호 확인 일치" complete={passwordReady} />
        </View>
        {passwordValidationMessage ? <Text style={ERROR_STATUS_TEXT_STYLE}>{passwordValidationMessage}</Text> : null}
        {passwordConfirmMessage ? <Text style={ERROR_STATUS_TEXT_STYLE}>{passwordConfirmMessage}</Text> : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>핸드폰번호</Text>
        <Text style={styles.helperText}>비공개 정보예요. 본인 인증과 계정 복구에 사용돼요.</Text>

        {isPhoneVerified ? (
          <View style={styles.phoneVerifiedRow}>
            <Text style={styles.phoneVerifiedText}>✓ {phone} 인증 완료</Text>
            <Pressable onPress={() => handlePhoneChange('')} disabled={submitting}>
              <Text style={styles.phoneVerifiedChangeText}>번호 변경</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.inlineInputRow}>
              <TextInput
                placeholder="010-0000-0000"
                placeholderTextColor={colors.textTertiary}
                style={phoneInputStyle}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={handlePhoneChange}
                editable={phoneInputEditable}
                autoCorrect={false}
              />
              <Pressable
                style={requestButtonStyle}
                onPress={handleRequestPhoneCode}
                disabled={requestButtonDisabled}
              >
                <Text style={styles.secondaryActionButtonText}>{requestButtonLabel}</Text>
              </Pressable>
            </View>

            {hasRequestedPhoneCode ? (
              <>
                <Text style={[styles.statusText, styles.statusTextNeutral]}>
                  문자로 받은 인증번호 6자리를 입력해주세요.
                </Text>
                <View style={styles.inlineInputRow}>
                  <TextInput
                    placeholder="인증번호 6자리"
                    placeholderTextColor={colors.textTertiary}
                    style={codeInputStyle}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={phoneVerificationCode}
                    onChangeText={handlePhoneVerificationCodeChange}
                    editable={codeInputEditable}
                    autoCorrect={false}
                  />
                  <Pressable
                    style={verifyButtonStyle}
                    onPress={handleVerifyPhoneCode}
                    disabled={verifyButtonDisabled}
                  >
                    <Text style={styles.secondaryActionButtonText}>{isVerifyingPhoneCode ? '확인 중' : '확인'}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        )}

        {phoneVerificationError ? <Text style={ERROR_STATUS_TEXT_STYLE}>{phoneVerificationError}</Text> : null}
      </View>
    </>
  );
}
