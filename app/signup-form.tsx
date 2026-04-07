import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { registerAccount } from '@/lib/session';

export default function SignupFormScreen() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await registerAccount({
        name,
        username,
        password,
        phone,
        districtName,
        birthDate,
      });
      router.push('/connect-sources');
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title="계정으로 회원가입" subtitle="기본 정보만 입력하면 바로 다음 단계인 기록 연동으로 넘어갈 수 있어." />

      <InfoCard title="다음 단계">회원가입 완료 후 기록 연동을 연결하면 홈에서 바로 경쟁을 시작할 수 있어.</InfoCard>

      <Card>
        <View style={styles.form}>
          <Input label="이름" placeholder="이름을 입력하세요" value={name} onChangeText={setName} editable={!submitting} />
          <Input label="아이디" placeholder="아이디를 입력하세요" value={username} onChangeText={setUsername} editable={!submitting} autoCapitalize="none" />
          <Input label="비밀번호" placeholder="비밀번호를 입력하세요" secureTextEntry value={password} onChangeText={setPassword} editable={!submitting} />
          <Input label="핸드폰번호" placeholder="010-0000-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!submitting} />
          <Input label="사는지역" placeholder="예: 강남구" value={districtName} onChangeText={setDistrictName} editable={!submitting} />
          <Input label="생년월일" placeholder="예: 1990-01-01" value={birthDate} onChangeText={setBirthDate} editable={!submitting} />

          <Pressable style={[styles.primaryButton, submitting ? styles.disabledButton : null]} onPress={handleSignup} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>회원가입하고 연동 단계로</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  value,
  onChangeText,
  editable = true,
  autoCapitalize,
}: {
  label: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
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
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
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
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
