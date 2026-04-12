import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { createFriendRequest, fetchFriendLeaderboard, fetchMyProfile } from '@/lib/api/services';
import { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

export default function AddFriendScreen() {
  const [friendTag, setFriendTag] = useState('');
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchFriendLeaderboard()])
      .then(([profileData, leaderboardData]) => {
        setProfile(profileData);
        setLeaderboard(leaderboardData);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '친구 추가 정보를 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!profile) {
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddFriend = async () => {
    if (!friendTag.trim()) {
      setError('친구 태그를 입력해줘.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await createFriendRequest(friendTag);
      setAdded(true);
      setFriendTag('');
      setTimeout(() => setAdded(false), 2000);

      const refreshedLeaderboard = await fetchFriendLeaderboard();
      setLeaderboard(refreshedLeaderboard);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '친구 요청 전송에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = leaderboard?.requests.filter((request) => request.status === 'pending').length ?? 0;
  const receivedCount = leaderboard?.requests.filter((request) => request.status === 'received').length ?? 0;

  return (
    <Screen>
      <AuthHeader
        title="친구 추가하기"
        subtitle="친구 태그로 검색해서 서로의 기록과 순위를 비교할 수 있어."
        showBack
        backHref="/(tabs)/friends"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading && profile ? (
        <Card>
          <Text style={styles.sectionTitle}>내 태그</Text>
          <View style={styles.tagBox}>
            <Text style={styles.tag}>{profile.publicTag}</Text>
            <Text style={styles.tagHint}>친구에게 이 태그를 공유하면 바로 추가할 수 있어.</Text>
            <Pressable style={styles.copyButton} onPress={handleCopy}>
              <Text style={styles.copyButtonText}>{copied ? '복사됨' : '태그 복사하기'}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>친구 요청 현황</Text>
        <Text style={styles.statusText}>보낸 요청 {pendingCount}건 · 받은 요청 {receivedCount}건</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>친구 태그 입력</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="예: #AB7K2"
            placeholderTextColor="#98A2B3"
            style={styles.input}
            autoCapitalize="characters"
            value={friendTag}
            onChangeText={(value) => setFriendTag(value.toUpperCase())}
            editable={!submitting}
          />
          <PrimaryButton label={submitting ? '친구 요청 보내는 중...' : '친구 요청 보내기'} onPress={handleAddFriend} />
          {friendTag.length > 0 ? <Text style={styles.helperText}>입력된 태그: {friendTag}</Text> : null}
          {added ? <Text style={styles.successText}>친구 요청을 보냈어. 상대가 수락하면 친구 랭킹에 함께 보여줄 수 있어.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>

      <InfoCard title="태그 규칙">친구 태그는 짧지만 중복 가능성이 낮은 5자리 공개 코드로 운영하고, 실제 계정 식별은 내부 ID로 따로 관리하는 구조가 좋아.</InfoCard>
      <SecondaryButton label="친구 화면으로 돌아가기" onPress={() => router.replace('/(tabs)/friends')} />
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
    gap: 8,
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
  copyButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  copyButtonText: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  statusText: {
    color: '#475467',
    lineHeight: 21,
    marginTop: 8,
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
  helperText: {
    color: '#667085',
    fontWeight: '600',
  },
  successText: {
    color: '#067647',
    fontWeight: '700',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
