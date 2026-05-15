import { Text, View } from 'react-native';
import { signupFormStyles as styles } from './signupFormStyles';

export function SignupUniversityRegionGuideSection() {
  return (
    <View style={styles.readyCard}>
      <Text style={styles.readyTitle}>대학교 인증은 나중에 할 수 있어요</Text>
      <Text style={styles.helperText}>
        지금은 회원가입을 먼저 끝내고, 대학교 인증은 마이페이지에서 재학증명서나 에브리타임 같은 방식으로 붙일 예정이에요.
      </Text>
    </View>
  );
}
