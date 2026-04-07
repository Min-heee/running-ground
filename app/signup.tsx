import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { USE_MOCK_API } from '@/lib/api/config';
import { signInWithProvider } from '@/lib/session';

const providers = [
  { id: 'kakao', label: '카카오톡으로 회원가입하기', buttonStyle: 'kakao' },
  { id: 'google', label: 'Google로 회원가입하기', buttonStyle: 'google' },
  { id: 'apple', label: 'Apple로 회원가입하기', buttonStyle: 'apple' },
  { id: 'naver', label: '네이버로 회원가입하기', buttonStyle: 'naver' },
  { id: 'account', label: '계정으로 회원가입하기', buttonStyle: 'account' },
] as const;

export default function SignupScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerAuthEnabled = USE_MOCK_API;

  const handleProviderSignup = async (providerId: Exclude<(typeof providers)[number]['id'], 'account'>) => {
    if (!providerAuthEnabled) {
      setError('현재 실백엔드 검증 중이라 간편 회원가입은 아직 준비되지 않았어. 계정 회원가입을 사용해줘.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await signInWithProvider(providerId);
      router.push('/connect-sources');
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : '간편 회원가입에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만든 뒤 기록 연동만 완료하면 바로 홈으로 들어가서 경쟁을 시작할 수 있어." />

      <InfoCard title="회원가입 후 흐름">회원가입 → 기록 연동 → 홈 진입</InfoCard>
      {!providerAuthEnabled ? (
        <InfoCard title="현재 권장 방식">실백엔드 검증 단계라 지금은 계정 회원가입이 가장 안정적이야.</InfoCard>
      ) : null}

      <Card>
        {!providerAuthEnabled ? <Text style={styles.helperText}>간편 회원가입은 준비 중이고, 아래 계정 회원가입은 지금 바로 사용할 수 있어.</Text> : null}
        <View style={styles.actions}>
          {providers.map((provider) => {
            if (provider.id === 'account') {
              return (
                <Link key={provider.id} href="/signup-form" asChild>
                  <Pressable style={getButtonStyle(provider.buttonStyle)}>
                    <Text style={styles.darkButtonText}>{provider.label}</Text>
                  </Pressable>
                </Link>
              );
            }

            const isDarkText = provider.buttonStyle === 'kakao' || provider.buttonStyle === 'google';

            return (
              <Pressable
                key={provider.id}
                style={[getButtonStyle(provider.buttonStyle), (submitting || !providerAuthEnabled) ? styles.disabledButton : null]}
                onPress={() => {
                  void handleProviderSignup(provider.id);
                }}
                disabled={submitting || !providerAuthEnabled}
              >
                {submitting ? <ActivityIndicator color={isDarkText ? '#111827' : '#FFFFFF'} /> : (
                  <Text style={isDarkText ? styles.darkButtonText : styles.lightButtonText}>
                    {providerAuthEnabled ? provider.label : `${provider.label} · 준비 중`}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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

function getButtonStyle(type: 'kakao' | 'google' | 'apple' | 'naver' | 'account') {
  switch (type) {
    case 'kakao':
      return styles.kakaoButton;
    case 'google':
      return styles.googleButton;
    case 'apple':
      return styles.appleButton;
    case 'naver':
      return styles.naverButton;
    default:
      return styles.accountButton;
  }
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  helperText: {
    color: '#667085',
    lineHeight: 20,
    marginBottom: 12,
  },
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
  accountButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
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
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 12,
  },
});
