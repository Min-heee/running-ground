import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SocialLoginButtons } from '@/features/auth/components/SocialLoginButtons';
import { useLoginScreen } from '@/features/auth/hooks/useLoginScreen';
import { useSocialLogin } from '@/features/auth/hooks/useSocialLogin';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function LoginScreen() {
  const {
    error,
    handleCheckServer,
    handleLogin,
    handleUsernameChange,
    loginReady,
    password,
    passwordVisible,
    serverCheck,
    setPassword,
    setPasswordVisible,
    submitting,
    username,
  } = useLoginScreen();
  const social = useSocialLogin();

  return (
    <Screen>
      <AuthHeader title="로그인" subtitle="로그인하면 바로 홈으로 들어가 경쟁을 시작할 수 있어요." showBack backHref="/onboarding" />

      <Card>
        <Text style={styles.sectionTitle}>계정으로 로그인</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="아이디"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={handleUsernameChange}
            editable={!submitting}
          />
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="비밀번호"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.passwordToggle} onPress={() => setPasswordVisible((current) => !current)} disabled={submitting}>
              <Text style={styles.passwordToggleText}>{passwordVisible ? '숨김' : '보기'}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>아이디는 소문자로 저장돼요. 공백 없이 입력해주세요.</Text>
          <Pressable style={[styles.accountButton, (!loginReady || submitting) ? styles.disabledButton : null]} onPress={handleLogin} disabled={!loginReady || submitting}>
            {submitting ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={styles.accountButtonText}>로그인하고 시작</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
        <SocialLoginButtons busyProvider={social.busyProvider} onPress={social.handleSocialLogin} disabled={submitting} />
        {social.error ? <Text style={styles.errorText}>{social.error}</Text> : null}
      </Card>

      <Card>
        <View style={styles.serverCardHeader}>
          <Text style={styles.serverTitle}>서버 연결</Text>
          <Pressable onPress={handleCheckServer} disabled={serverCheck.status === 'checking'}>
            <Text style={styles.serverAction}>{serverCheck.status === 'checking' ? '확인 중' : '다시 확인'}</Text>
          </Pressable>
        </View>
        <Text
          style={[
            styles.serverText,
            serverCheck.status === 'ok'
              ? styles.serverTextOk
              : serverCheck.status === 'error'
                ? styles.serverTextError
                : null,
          ]}
        >
          {serverCheck.message}
        </Text>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>처음이신가요?</Text>
        <Link href="/signup" asChild>
          <Pressable>
            <Text style={styles.footerLink}>회원가입</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>계정이 기억나지 않나요?</Text>
        <Link href={'/account-recovery' as never} asChild>
          <Pressable>
            <Text style={styles.footerLink}>아이디/비밀번호 찾기</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: fontSizes.title, fontWeight: fontWeights.extraBold, color: colors.textPrimary },
  form: { gap: spacing.s12, marginTop: 8 },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 19,
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
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 64,
  },
  passwordToggle: {
    position: 'absolute',
    right: spacing.s10,
    top: 9,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  passwordToggleText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  accountButton: {
    backgroundColor: colors.brandWash,
    borderWidth: 1,
    borderColor: colors.brandLighter,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  accountButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  serverCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  serverTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  serverAction: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.md,
  },
  serverText: {
    marginTop: spacing.xxl,
    color: colors.textSecondary,
    lineHeight: 19,
    fontSize: fontSizes.sm,
  },
  serverTextOk: {
    color: colors.successText,
  },
  serverTextError: {
    color: colors.danger,
  },
  disabledButton: {
    opacity: 0.6,
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
  },
});
