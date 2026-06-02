import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { SocialAuthButtons } from '@/components/ui/SocialAuthButtons';
import { signIn } from '@/lib/session';
import { colors, radius } from '@/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAccountLogin = async () => {
    if (!username.trim() || !password) {
      setFormError('아이디와 비밀번호를 모두 입력해줘.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn();
      router.push('/connect-sources');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialLogin = async () => {
    await signIn();
    router.push('/connect-sources');
  };

  return (
    <Screen>
      <AuthHeader title="로그인" subtitle="로그인 후 기록 연동 단계만 거치면 바로 홈에서 친구 경쟁과 내 활동을 볼 수 있어." />

      <InfoCard title="로그인 후 흐름">로그인 → 기록 연동 → 홈 진입</InfoCard>

      <Card>
        <Text style={styles.sectionTitle}>계정으로 로그인</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="아이디"
            placeholderTextColor={colors.textPlaceholder}
            style={styles.input}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            placeholder="비밀번호"
            placeholderTextColor={colors.textPlaceholder}
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          <Pressable
            style={[styles.accountButton, submitting && styles.accountButtonDisabled]}
            onPress={handleAccountLogin}
            disabled={submitting}
          >
            <Text style={styles.accountButtonText}>로그인하고 연동 단계로</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>간편 로그인</Text>
        <View style={styles.socialWrap}>
          <SocialAuthButtons intent="login" onSocialPress={handleSocialLogin} />
        </View>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>처음이신가요?</Text>
        <Link href="/signup" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.footerLink}>회원가입</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  form: { gap: 12, marginTop: 8 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
  },
  accountButton: {
    backgroundColor: colors.brandPrimarySoft,
    borderWidth: 1,
    borderColor: colors.brandPrimaryMuted,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  accountButtonDisabled: {
    opacity: 0.6,
  },
  accountButtonText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  socialWrap: { marginTop: 8 },
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
