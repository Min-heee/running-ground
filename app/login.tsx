import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';

const providers = [
  { id: 'kakao', label: '카카오톡으로 계속하기' },
  { id: 'google', label: 'Google로 계속하기' },
  { id: 'apple', label: 'Apple로 계속하기' },
];

export default function LoginScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>RUNNIGAPP</Text>
        <Text style={styles.title}>로그인</Text>
        <Text style={styles.subtitle}>계정을 만든 뒤 기록 소스를 연결하면 경쟁이 바로 시작돼.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>계정으로 로그인</Text>
        <View style={styles.form}>
          <TextInput placeholder="아이디" placeholderTextColor="#98A2B3" style={styles.input} autoCapitalize="none" />
          <TextInput placeholder="비밀번호" placeholderTextColor="#98A2B3" style={styles.input} secureTextEntry />
          <Link href="/connect-sources" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>로그인하고 계속</Text>
            </Pressable>
          </Link>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>간편 로그인</Text>
        <View style={styles.socialButtons}>
          {providers.map((provider) => (
            <Pressable key={provider.id} style={styles.socialButton}>
              <Text style={styles.socialButtonText}>{provider.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>처음이신가요?</Text>
        <Text style={styles.footerLink}>회원가입</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  logo: { color: '#6D5EF7', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 32, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 22 },
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
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  socialButtons: { gap: 10, marginTop: 8 },
  socialButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  socialButtonText: {
    color: '#111827',
    fontWeight: '700',
    textAlign: 'center',
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
