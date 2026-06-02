import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { myProfile } from '@/data/mock';
import { colors, radius } from '@/theme';

export default function EditProfileScreen() {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [saved]);

  const handleSave = () => {
    setSaved(true);
  };

  return (
    <Screen>
      <AuthHeader title="프로필 수정" subtitle="닉네임과 기본 프로필 정보를 관리할 수 있어." />

      <Card>
        <View style={styles.form}>
          <Input label="이름" value={myProfile.name} />
          <Input label="내 태그" value={myProfile.publicTag} editable={false} />
          <Input label="상태 메시지" value="러닝 경쟁 진행 중" />
          <PrimaryButton label="저장하기" onPress={handleSave} />
          {saved ? <Text style={styles.savedText}>프로필이 저장됐어.</Text> : null}
        </View>
      </Card>
    </Screen>
  );
}

function Input({ label, value, editable = true }: { label: string; value: string; editable?: boolean }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} editable={editable} style={[styles.input, !editable && styles.disabledInput]} placeholderTextColor={colors.textPlaceholder} />
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
  disabledInput: {
    color: colors.textPlaceholder,
    backgroundColor: colors.surfaceSubtle,
  },
  savedText: {
    color: colors.success,
    fontWeight: '700',
  },
});
