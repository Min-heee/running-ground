import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';

export default function SignupScreen() {
  return (
    <Screen>
      <AuthHeader title="회원가입" subtitle="계정을 만들고, 공개 표시 이름까지 정한 뒤 바로 러닝 경쟁을 시작해보세요." showBack backHref="/onboarding" />

      <Card>
        <Text style={styles.helperText}>회원가입할 때 지역 랭킹이나 친구 화면에 본명으로 보일지, 닉네임으로 보일지 직접 고를 수 있어요. 이름과 연락처는 비공개로 저장되고, 대학교는 가입 뒤 마이페이지에서 인증 방식으로 연결할 예정이에요.</Text>
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
