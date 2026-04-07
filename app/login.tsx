import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { signIn, signInWithProvider } from '@/lib/session';

const providers = [
  { id: 'kakao', label: '카카오톡으로 로그인하기', buttonStyle: 'kakao' },
  { id: 'google', label: 'Google로 로그인하기', buttonStyle: 'google' },
  { id: 'apple', label: 'Apple로 로그인하기', buttonStyle: 'apple' },
  { id: 'naver', label: '네이버로 로그인하기', buttonStyle: 'naver' },
] as const;

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await signIn({ username, password });
      router.push('/connect-sources');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '로그인에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProviderLogin = async (providerId: (typeof providers)[number]['id']) => {
    setError(null);
    setSubmitting(true);

    try {
      await signInWithProvider(providerId);
      router.push('/connect-sources');
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : '간편 로그인에 실패했어.');
    } finally {
      setSubmitting(false);
    }
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
            placeholderTextColor="#98A2B3"
            style={styles.input}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
            editable={!submitting}
          />
          <TextInput
            placeholder="비밀번호"
            placeholderTextColor="#98A2B3"
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
          />
          <Pressable style={[styles.accountButton, submitting ? styles.disabledButton : null]} onPress={handleLogin} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#111827" /> : <Text style={styles.accountButtonText}>로그인하고 연동 단계로</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>간편 로그인</Text>
        <View style={styles.socialButtons}>
          {providers.map((provider) => {
            const isDarkText = provider.buttonStyle === 'kakao' || provider.buttonStyle === 'google';
            return (
              <Pressable
                key={provider.id}
                style={[getButtonStyle(provider.buttonStyle), submitting ? styles.disabledButton : null]}
                onPress={() => {
                  void handleProviderLogin(provider.id);
                }}
                disabled={submitting}
              >
                <Text style={isDarkText ? styles.darkButtonText : styles.lightButtonText}>{provider.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>처음이신가요?</Text>
        <Link href="/signup" asChild>
          <Pressable>
            <Text style={styles.footerLink}>회원가입</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

function getButtonStyle(type: 'kakao' | 'google' | 'apple' | 'naver') {
  switch (type) {
    case 'kakao':
      return styles.kakaoButton;
    case 'google':
      return styles.googleButton;
    case 'apple':
      return styles.appleButton;
    case 'naver':
      return styles.naverButton;
  }
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  form: { gap: 12, marginTop: 8 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#111827',
  },
  accountButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  accountButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  socialButtons: { gap: 10, marginTop: 8 },
  kakaoButton: {
    backgroundColor: '#FEE500',
    borderWidth: 1,
    borderColor: '#FEE500',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  appleButton: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  naverButton: {
    backgroundColor: '#03C75A',
    borderWidth: 1,
    borderColor: '#03C75A',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  darkButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  lightButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  footerText: {
    color: '#667085',
  },
  footerLink: {
    color: '#6D5EF7',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
