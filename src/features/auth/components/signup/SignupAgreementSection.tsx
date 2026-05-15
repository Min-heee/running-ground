import { Text, View } from 'react-native';
import { ValidationItem } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';

type SignupAgreementSectionProps = Pick<
  SignupFormModel,
  | 'normalizedPhone'
  | 'passwordReady'
  | 'requiredProfileReady'
  | 'usernameReady'
>;

export function SignupAgreementSection({
  normalizedPhone,
  passwordReady,
  requiredProfileReady,
  usernameReady,
}: SignupAgreementSectionProps) {
  return (
    <View style={styles.readyCard}>
      <Text style={styles.readyTitle}>가입 준비 상태</Text>
      <ValidationItem label="기본 정보와 지역 입력" complete={requiredProfileReady} />
      <ValidationItem label="휴대폰 번호 입력" complete={normalizedPhone.length >= 10} />
      <ValidationItem label="아이디 중복 확인 완료" complete={usernameReady} />
      <ValidationItem label="비밀번호 조건 충족" complete={passwordReady} />
    </View>
  );
}
