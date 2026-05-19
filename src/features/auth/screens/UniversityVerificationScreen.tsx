import { ActivityIndicator, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { UniversityVerificationContent } from '@/features/auth/components/universityVerification/UniversityVerificationContent';
import { universityVerificationStyles as styles } from '@/features/auth/components/universityVerification/universityVerificationStyles';
import { useUniversityVerification } from '@/features/auth/hooks/useUniversityVerification';
import { colors } from '@/theme/tokens';

export default function UniversityVerificationScreen() {
  const model = useUniversityVerification();

  return (
    <Screen>
      <AuthHeader
        title="대학교 인증"
        subtitle="대학교는 가입 단계에서 바로 받지 않고, 인증 기반으로만 연결할 예정이에요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {model.loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {model.error ? <Text style={styles.errorText}>{model.error}</Text> : null}
      {!model.loading ? <UniversityVerificationContent model={model} /> : null}
    </Screen>
  );
}
