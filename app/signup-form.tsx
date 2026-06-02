import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { signIn } from '@/lib/session';
import { colors, radius } from '@/theme';

type Field = 'username' | 'password' | 'phone' | 'district' | 'birthday';

const FIELDS: { key: Field; label: string; placeholder: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'phone-pad' }[] = [
  { key: 'username', label: '아이디', placeholder: '아이디를 입력하세요' },
  { key: 'password', label: '비밀번호', placeholder: '비밀번호를 입력하세요', secureTextEntry: true },
  { key: 'phone', label: '핸드폰번호', placeholder: '010-0000-0000', keyboardType: 'phone-pad' },
  { key: 'district', label: '사는지역', placeholder: '예: 강남구' },
  { key: 'birthday', label: '생년월일', placeholder: '예: 1990-01-01' },
];

const EMPTY_FORM: Record<Field, string> = {
  username: '',
  password: '',
  phone: '',
  district: '',
  birthday: '',
};

export default function SignupFormScreen() {
  const [values, setValues] = useState<Record<Field, string>>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (key: Field) => (text: string) => {
    setValues((prev) => ({ ...prev, [key]: text }));
  };

  const handleSignup = async () => {
    const missing = FIELDS.find((field) => !values[field.key].trim());
    if (missing) {
      setFormError(`${missing.label}을(를) 입력해줘.`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn();
      router.push('/connect-sources');
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
          {FIELDS.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              secureTextEntry={field.secureTextEntry}
              keyboardType={field.keyboardType}
              value={values[field.key]}
              onChangeText={handleChange(field.key)}
            />
          ))}

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={handleSignup}
            disabled={submitting}
          >
            <Text style={styles.primaryButtonText}>회원가입하고 연동 단계로</Text>
          </Pressable>
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
}: {
  label: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        style={styles.input}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={secureTextEntry ? 'none' : 'sentences'}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.textOnDark,
    fontWeight: '800',
    fontSize: 16,
  },
});
