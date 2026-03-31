import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';

const providers = [
  { id: 'kakao', label: '카카오톡으로 회원가입하기', buttonStyle: 'kakao' },
  { id: 'google', label: 'Google로 회원가입하기', buttonStyle: 'google' },
  { id: 'apple', label: 'Apple로 회원가입하기', buttonStyle: 'apple' },
  { id: 'naver', label: '네이버로 회원가입하기', buttonStyle: 'naver' },
  { id: 'account', label: '계정으로 회원가입하기', buttonStyle: 'account' },
] as const;

export default function SignupScreen() {
  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만든 뒤 기록 연동만 완료하면 바로 홈으로 들어가서 경쟁을 시작할 수 있어." />

      <InfoCard title="회원가입 후 흐름">회원가입 → 기록 연동 → 홈 진입</InfoCard>

      <Card>
        <View style={styles.actions}>
          {providers.map((provider) => {
            const href = provider.id === 'account' ? '/signup-form' : '/connect-sources';
            const isDarkText = provider.buttonStyle === 'kakao' || provider.buttonStyle === 'google' || provider.buttonStyle === 'account';

            return (
              <Link key={provider.id} href={href} asChild>
                <Pressable style={getButtonStyle(provider.buttonStyle)}>
                  <Text style={isDarkText ? styles.darkButtonText : styles.lightButtonText}>{provider.label}</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
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
});
