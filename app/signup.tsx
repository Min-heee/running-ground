import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { SocialAuthButtons } from '@/components/ui/SocialAuthButtons';
import { signIn } from '@/lib/session';
import { colors } from '@/theme';

export default function SignupScreen() {
  const handleSocialSignup = async () => {
    await signIn();
    router.push('/connect-sources');
  };

  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만든 뒤 기록 연동만 완료하면 바로 홈으로 들어가서 경쟁을 시작할 수 있어." />

      <InfoCard title="회원가입 후 흐름">회원가입 → 기록 연동 → 홈 진입</InfoCard>

      <Card>
        <SocialAuthButtons intent="signup" onSocialPress={handleSocialSignup} showAccountOption />
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>이미 계정이 있나요?</Text>
        <Link href="/login" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.footerLink}>로그인</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  footerText: {
    color: colors.textMuted,
  },
  footerLink: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
});
