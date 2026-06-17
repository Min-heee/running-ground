import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SocialLoginButtons } from '@/features/auth/components/SocialLoginButtons';
import { useSocialLogin } from '@/features/auth/hooks/useSocialLogin';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function SignupScreen() {
  const social = useSocialLogin();

  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만들고, 공개 표시 이름까지 정한 뒤 바로 러닝 경쟁을 시작해보세요." showBack backHref="/onboarding" />

      <Card>
        <Text style={styles.helperText}>회원가입할 때 지역 랭킹이나 친구 화면에 본명으로 보일지, 닉네임으로 보일지 직접 고를 수 있어요. 이름과 연락처는 비공개로 저장돼요.</Text>
        <Link href="/signup-form" asChild>
          <Pressable style={styles.accountButton}>
            <Text style={styles.darkButtonText}>계정으로 회원가입하기</Text>
          </Pressable>
        </Link>
        <SocialLoginButtons busyProvider={social.busyProvider} onPress={social.handleSocialLogin} />
        {social.error ? <Text style={styles.errorText}>{social.error}</Text> : null}
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>이미 계정이 있나요?</Text>
        <Link href="/login" asChild>
          <Pressable>
            <Text style={styles.footerLink}>로그인</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.s12,
  },
  accountButton: {
    backgroundColor: colors.brandWash,
    borderWidth: 1,
    borderColor: colors.brandLighter,
    borderRadius: radii.lg,
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s16,
    alignItems: 'center',
  },
  darkButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.button,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xxl,
  },
  footerText: {
    color: colors.textSecondary,
  },
  footerLink: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
    marginTop: spacing.s12,
  },
});
