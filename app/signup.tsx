import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';

export default function SignupScreen() {
  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만들고 바로 러닝 경쟁을 시작해보세요." />

      <Card>
        <Text style={styles.helperText}>이름, 아이디, 비밀번호만 입력하면 바로 시작할 수 있어요.</Text>
        <Link href="/signup-form" asChild>
          <Pressable style={styles.accountButton}>
            <Text style={styles.darkButtonText}>계정으로 회원가입하기</Text>
          </Pressable>
        </Link>
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
    color: '#667085',
    lineHeight: 20,
    marginBottom: 12,
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
