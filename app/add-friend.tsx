import { StyleSheet, Text, View, TextInput } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { myProfile } from '@/data/mock';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

export default function AddFriendScreen() {
  return (
    <Screen>
      <AuthHeader title="친구 추가하기" subtitle="친구 태그로 검색해서 서로의 기록과 순위를 비교할 수 있어." />

      <Card>
        <Text style={styles.sectionTitle}>내 친구 태그</Text>
        <View style={styles.tagBox}>
          <Text style={styles.tag}>{myProfile.publicTag}</Text>
          <Text style={styles.tagHint}>친구에게 이 태그를 공유하면 바로 추가할 수 있어.</Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>친구 태그 입력</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="예: #AB7K2"
            placeholderTextColor="#98A2B3"
            style={styles.input}
            autoCapitalize="characters"
          />
          <PrimaryButton label="친구 추가하기" />
        </View>
      </Card>

      <InfoCard title="태그 규칙">친구 태그는 짧지만 중복 가능성이 낮은 5자리 공개 코드로 운영하고, 실제 계정 식별은 내부 ID로 따로 관리하는 구조가 좋아.</InfoCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  tagBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: 18,
    padding: 16,
    gap: 6,
    marginTop: 8,
  },
  tag: {
    fontSize: 28,
    fontWeight: '800',
    color: '#6D5EF7',
  },
  tagHint: {
    color: '#667085',
    lineHeight: 20,
  },
  form: {
    gap: 12,
    marginTop: 8,
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
});
