import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';

const providers = [
  { id: 'kakao', label: '카카오톡으로 로그인하기', buttonStyle: 'kakao' },
  { id: 'google', label: 'Google로 로그인하기', buttonStyle: 'google' },
  { id: 'apple', label: 'Apple로 로그인하기', buttonStyle: 'apple' },
  { id: 'naver', label: '네이버로 로그인하기', buttonStyle: 'naver' },
] as const;

export default function LoginScreen() {
  return (
    <Screen>
      <AuthHeader title="로그인" subtitle="이미 계정이 있다면 원하는 방식으로 로그인하고 기록 연동 단계로 넘어가면 돼." />

      <Card>
        <Text style={styles.sectionTitle}>계정으로 로그인</Text>
        <View style={styles.form}>
          <TextInput placeholder="아이디" placeholderTextColor="#98A2B3" style={styles.input} autoCapitalize="none" />
          <TextInput placeholder="비밀번호" placeholderTextColor="#98A2B3" style={styles.input} secureTextEntry />
          <Link href="/connect-sources" asChild>
            <Pressable style={styles.accountButton}>
              <Text style={styles.accountButtonText}>로그인하고 계속</Text>
            </Pressable>
          </Link>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>간편 로그인</Text>
        <View style={styles.socialButtons}>
          {providers.map((provider) => {
            const isDarkText = provider.buttonStyle === 'kakao' || provider.buttonStyle === 'google';
            return (
              <Link key={provider.id} href="/connect-sources" asChild>
                <Pressable style={getButtonStyle(provider.buttonStyle)}>
                  <Text style={isDarkText ? styles.darkButtonText : styles.lightButtonText}>{provider.label}</Text>
                </Pressable>
              </Link>
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
});
