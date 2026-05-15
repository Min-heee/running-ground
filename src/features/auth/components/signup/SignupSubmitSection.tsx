import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SignupInput, ValidationItem } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';

type SignupSubmitSectionProps = Pick<
  SignupFormModel,
  | 'birthDate'
  | 'catalogError'
  | 'catalogLoading'
  | 'error'
  | 'handleBirthDateChange'
  | 'handleSignup'
  | 'normalizedPhone'
  | 'passwordReady'
  | 'requiredProfileReady'
  | 'signupReady'
  | 'submitting'
  | 'usernameReady'
>;

export function SignupSubmitSection({
  birthDate,
  catalogError,
  catalogLoading,
  error,
  handleBirthDateChange,
  handleSignup,
  normalizedPhone,
  passwordReady,
  requiredProfileReady,
  signupReady,
  submitting,
  usernameReady,
}: SignupSubmitSectionProps) {
  return (
    <>
      <View style={styles.readyCard}>
        <Text style={styles.readyTitle}>대학교 인증은 나중에 할 수 있어요</Text>
        <Text style={styles.helperText}>
          지금은 회원가입을 먼저 끝내고, 대학교 인증은 마이페이지에서 재학증명서나 에브리타임 같은 방식으로 붙일 예정이에요.
        </Text>
      </View>

      <SignupInput
        label="생년월일"
        helperText="비공개 정보예요. YYYY-MM-DD 형식으로 저장돼요."
        placeholder="예: 1990-01-01"
        value={birthDate}
        onChangeText={handleBirthDateChange}
        editable={!submitting}
      />

      <View style={styles.readyCard}>
        <Text style={styles.readyTitle}>가입 준비 상태</Text>
        <ValidationItem label="기본 정보와 지역 입력" complete={requiredProfileReady} />
        <ValidationItem label="휴대폰 번호 입력" complete={normalizedPhone.length >= 10} />
        <ValidationItem label="아이디 중복 확인 완료" complete={usernameReady} />
        <ValidationItem label="비밀번호 조건 충족" complete={passwordReady} />
      </View>

      <Pressable
        style={[styles.primaryButton, (submitting || catalogLoading || Boolean(catalogError) || !signupReady) ? styles.disabledButton : null]}
        onPress={handleSignup}
        disabled={submitting || catalogLoading || Boolean(catalogError) || !signupReady}
      >
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{signupReady ? '회원가입하고 시작' : '필수 정보 확인 필요'}</Text>}
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );
}
