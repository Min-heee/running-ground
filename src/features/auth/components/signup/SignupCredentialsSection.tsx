import { Pressable, Text, TextInput, View } from 'react-native';
import { PASSWORD_RULE_DESCRIPTION, USERNAME_RULE_DESCRIPTION } from '@/lib/session';
import { SignupInput, ValidationItem } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';

type SignupCredentialsSectionProps = Pick<
  SignupFormModel,
  | 'checkingUsername'
  | 'handleCheckUsername'
  | 'handlePhoneChange'
  | 'handleUsernameChange'
  | 'password'
  | 'passwordConfirm'
  | 'passwordConfirmMessage'
  | 'passwordReady'
  | 'passwordValidationMessage'
  | 'passwordVisible'
  | 'phone'
  | 'setPassword'
  | 'setPasswordConfirm'
  | 'setPasswordVisible'
  | 'submitting'
  | 'username'
  | 'usernameCheck'
  | 'usernameReady'
  | 'usernameValidationMessage'
>;

export function SignupCredentialsSection({
  checkingUsername,
  handleCheckUsername,
  handlePhoneChange,
  handleUsernameChange,
  password,
  passwordConfirm,
  passwordConfirmMessage,
  passwordReady,
  passwordValidationMessage,
  passwordVisible,
  phone,
  setPassword,
  setPasswordConfirm,
  setPasswordVisible,
  submitting,
  username,
  usernameCheck,
  usernameReady,
  usernameValidationMessage,
}: SignupCredentialsSectionProps) {
  return (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>아이디</Text>
        <Text style={styles.helperText}>{USERNAME_RULE_DESCRIPTION} 입력 후 중복 확인을 해주세요.</Text>
        <View style={styles.inlineInputRow}>
          <TextInput
            placeholder="아이디를 입력하세요"
            placeholderTextColor="#98A2B3"
            style={[styles.input, styles.inlineInput, !submitting && !checkingUsername ? null : styles.inputDisabled]}
            value={username}
            onChangeText={handleUsernameChange}
            editable={!submitting && !checkingUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.secondaryActionButton, (submitting || checkingUsername) && styles.disabledButton]}
            onPress={handleCheckUsername}
            disabled={submitting || checkingUsername}
          >
            <Text style={styles.secondaryActionButtonText}>{checkingUsername ? '확인 중' : usernameReady ? '사용 가능' : '중복 확인'}</Text>
          </Pressable>
        </View>
        {usernameValidationMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{usernameValidationMessage}</Text> : null}
        {usernameCheck.message ? (
          <Text
            style={[
              styles.statusText,
              usernameCheck.status === 'available'
                ? styles.statusTextSuccess
                : usernameCheck.status === 'checking'
                  ? styles.statusTextNeutral
                  : styles.statusTextError,
            ]}
          >
            {usernameCheck.message}
          </Text>
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>비밀번호</Text>
          <Pressable onPress={() => setPasswordVisible((current) => !current)} disabled={submitting}>
            <Text style={styles.inlineToggleText}>{passwordVisible ? '숨김' : '보기'}</Text>
          </Pressable>
        </View>
        <Text style={styles.helperText}>{PASSWORD_RULE_DESCRIPTION}</Text>
        <TextInput
          placeholder="비밀번호를 입력하세요"
          placeholderTextColor="#98A2B3"
          style={[styles.input, submitting && styles.inputDisabled]}
          secureTextEntry={!passwordVisible}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          placeholder="비밀번호를 한 번 더 입력하세요"
          placeholderTextColor="#98A2B3"
          style={[styles.input, submitting && styles.inputDisabled]}
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
        {passwordValidationMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{passwordValidationMessage}</Text> : null}
        {passwordConfirmMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{passwordConfirmMessage}</Text> : null}
      </View>

      <SignupInput
        label="핸드폰번호"
        helperText="비공개 정보예요. 계정 확인과 복구에 사용돼요."
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={handlePhoneChange}
        editable={!submitting}
      />
    </>
  );
}
