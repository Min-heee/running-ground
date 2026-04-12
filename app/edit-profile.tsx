import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchMyProfile, updateMyProfile } from '@/lib/api/services';
import { MyProfileResponse } from '@/lib/api/types';

export default function EditProfileScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [name, setName] = useState('');
  const [universityName, setUniversityName] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then((nextProfile) => {
        setProfile(nextProfile);
        setName(nextProfile.name);
        setUniversityName(nextProfile.universityName ?? '');
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '프로필을 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('이름은 비워둘 수 없어.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyProfile({ name, universityName });
      setProfile(nextProfile);
      setName(nextProfile.name);
      setUniversityName(nextProfile.universityName ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '프로필 저장에 실패했어.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="프로필 수정"
        subtitle="닉네임과 기본 프로필 정보를 관리할 수 있어."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading && profile ? (
        <Card>
          <View style={styles.form}>
            <Input label="이름" value={name} onChangeText={setName} editable={!saving} />
            <Input label="소속 대학" value={universityName} onChangeText={setUniversityName} editable={!saving} />
            <Input label="내 태그" value={profile.publicTag} editable={false} />
            <Input label="대표 지역" value={profile.districtName} editable={false} />
            <Input label="상태 메시지" value="러닝 경쟁 진행 중" editable={false} />
            <PrimaryButton label={saving ? '저장 중...' : '저장하기'} onPress={handleSave} />
            <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
            {saved ? <Text style={styles.savedText}>프로필이 저장됐어.</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </Card>
      ) : null}

      {!loading && !profile && error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Screen>
  );
}

function Input({
  label,
  value,
  editable = true,
  onChangeText,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChangeText}
        style={[styles.input, !editable && styles.disabledInput]}
        placeholderTextColor="#98A2B3"
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
  disabledInput: {
    color: '#98A2B3',
    backgroundColor: '#F2F4F7',
  },
  savedText: {
    color: '#067647',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
