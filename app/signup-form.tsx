import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';

export default function SignupFormScreen() {
  return (
    <Screen>
      <AuthHeader title="계정으로 회원가입" subtitle="기본 정보만 입력하면 바로 다음 단계인 기록 연동으로 넘어갈 수 있어." />

      <InfoCard title="다음 단계">회원가입 완료 후 기록 연동을 연결하면 홈에서 바로 경쟁을 시작할 수 있어.</InfoCard>

      <Card>
        <View style={styles.form}>
          <Input label="아이디" placeholder="아이디를 입력하세요" />
          <Input label="비밀번호" placeholder="비밀번호를 입력하세요" secureTextEntry />
          <Input label="핸드폰번호" placeholder="010-0000-0000" keyboardType="phone-pad" />
          <Input label="사는지역" placeholder="예: 강남구" />
          <Input label="생년월일" placeholder="예: 1990-01-01" />

          <Link href="/connect-sources" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>회원가입하고 연동 단계로</Text>
            </Pressable>
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

function Input({
  label,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        style={styles.input}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  label: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },
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
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
