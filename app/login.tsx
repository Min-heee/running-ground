import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';

const providers = [
  { id: 'kakao', label: '카카오톡으로 로그인' },
  { id: 'google', label: 'Google로 로그인' },
  { id: 'apple', label: 'Apple로 로그인' },
];

export default function LoginScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>RUNNIGAPP</Text>
        <Text style={styles.title}>러닝 경쟁을 시작해보자</Text>
        <Text style={styles.subtitle}>로그인 후 홈에서 친구 경쟁, 구 내 경쟁, 지역 배틀을 바로 확인할 수 있어.</Text>
      </View>

      <Card>
        <SectionTitle>로그인</SectionTitle>
        <View style={styles.form}>
          <TextInput placeholder="아이디" placeholderTextColor="#98A2B3" style={styles.input} autoCapitalize="none" />
          <TextInput placeholder="비밀번호" placeholderTextColor="#98A2B3" style={styles.input} secureTextEntry />
          <Link href="/(tabs)/home" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>로그인</Text>
            </Pressable>
          </Link>
        </View>
      </Card>

      <Card>
        <SectionTitle>간편 로그인</SectionTitle>
        <View style={styles.socialButtons}>
          {providers.map((provider) => (
            <Pressable key={provider.id} style={styles.socialButton}>
              <Text style={styles.socialButtonText}>{provider.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  logo: { color: '#6D5EF7', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 30, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 22 },
  form: { gap: 12 },
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
  },
  socialButtons: { gap: 10 },
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
});
