import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';

const providers = [
  { id: 'kakao', label: '카카오톡으로 회원가입하기', primary: true },
  { id: 'google', label: 'Google로 회원가입하기' },
  { id: 'apple', label: 'Apple로 회원가입하기' },
  { id: 'email', label: '그냥 회원가입하기' },
];

export default function SignupScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>RUNNIGAPP</Text>
        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.subtitle}>먼저 계정을 만들고, 다음 단계에서 기록 연동을 연결하면 돼.</Text>
      </View>

      <Card>
        <View style={styles.actions}>
          {providers.map((provider) => (
            <Link key={provider.id} href="/connect-sources" asChild>
              <Pressable style={provider.primary ? styles.primaryButton : styles.button}>
                <Text style={provider.primary ? styles.primaryButtonText : styles.buttonText}>{provider.label}</Text>
              </Pressable>
            </Link>
          ))}
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

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  logo: { color: '#6D5EF7', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 32, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 22 },
  actions: { gap: 10 },
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderWidth: 1,
    borderColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
  primaryButtonText: {
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
