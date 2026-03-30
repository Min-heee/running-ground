import { StyleSheet, Text, View, TextInput } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { myProfile } from '@/data/mock';

export default function EditProfileScreen() {
  return (
    <Screen>
      <AuthHeader title="프로필 수정" subtitle="닉네임과 기본 프로필 정보를 관리할 수 있어." />

      <Card>
        <View style={styles.form}>
          <Input label="이름" value={myProfile.name} />
          <Input label="내 태그" value={myProfile.publicTag} editable={false} />
          <Input label="상태 메시지" value="러닝 경쟁 진행 중" />
          <PrimaryButton label="저장하기" />
        </View>
      </Card>
    </Screen>
  );
}

function Input({ label, value, editable = true }: { label: string; value: string; editable?: boolean }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} editable={editable} style={[styles.input, !editable && styles.disabledInput]} placeholderTextColor="#98A2B3" />
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
  disabledInput: {
    color: '#98A2B3',
    backgroundColor: '#F2F4F7',
  },
});
