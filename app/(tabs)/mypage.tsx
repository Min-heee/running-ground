import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListRow } from '@/components/ui/ListRow';
import { Tappable } from '@/components/ui/Tappable';
import { fetchHomeSummary, fetchIntegrationStatus, fetchMyProfile } from '@/lib/api/services';
import { IntegrationStatusResponse } from '@/lib/api/types';
import { UserProfile, WeeklySummary } from '@/domain/types';
import { signOut } from '@/lib/session';
import { colors, radius } from '@/theme';

export default function MyPageScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagShared, setTagShared] = useState(false);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchHomeSummary(), fetchIntegrationStatus()])
      .then(([profileData, summaryData, integrationData]) => {
        setProfile(profileData);
        setSummary(summaryData);
        setIntegrationStatus(integrationData);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!tagShared) return;
    const timer = setTimeout(() => setTagShared(false), 1500);
    return () => clearTimeout(timer);
  }, [tagShared]);

  const handleShareTag = () => {
    setTagShared(true);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃할까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setProfile(null);
          setSummary(null);
          setIntegrationStatus(null);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const connectedCount = integrationStatus?.sources.filter((source) => source.connected).length ?? 0;

  return (
    <Screen>
      <PageHeader title="마이페이지" subtitle="내 프로필, 활동 요약, 연동 상태와 설정을 한 번에 관리." />

      {loading ? <ActivityIndicator size="large" color={colors.brandPrimary} /> : null}

      {profile && summary && integrationStatus ? (
        <>
          <Card style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.subline}>{profile.districtName} · 러닝 경쟁 진행 중</Text>
              <Text style={styles.tag}>{profile.publicTag}</Text>
            </View>
          </Card>

          <View style={styles.profileActions}>
            <Link href="/edit-profile" asChild>
              <Tappable style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>프로필 수정</Text>
              </Tappable>
            </Link>
            <Tappable style={styles.secondaryAction} onPress={handleShareTag}>
              <Text style={styles.secondaryActionText}>{tagShared ? '공유 준비됨' : '내 태그 공유'}</Text>
            </Tappable>
          </View>

          <Link href="/my-activity" asChild>
            <Tappable>
              <Card>
                <SectionTitle>내 활동</SectionTitle>
                <View style={styles.metricRow}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricValue}>{summary.totalDistanceKm}km</Text>
                    <Text style={styles.metricLabel}>이번 주 거리</Text>
                  </View>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricValue}>{summary.districtPoints}P</Text>
                    <Text style={styles.metricLabel}>포인트</Text>
                  </View>
                </View>
              </Card>
            </Tappable>
          </Link>

          <Card>
            <SectionTitle>연동 요약</SectionTitle>
            <ListRow>{`현재 연결된 기록 소스 ${connectedCount}개`}</ListRow>
            <ListRow>{`최근 반영 기록 ${summary.latestRun.distanceKm}km`}</ListRow>
          </Card>

          <IntegrationStatus sources={integrationStatus.sources} />

          <Card>
            <SectionTitle>계정 관리</SectionTitle>
            <ListRow>계정 정보</ListRow>
            <ListRow>비밀번호 변경</ListRow>
            <ListRow>핸드폰번호 관리</ListRow>
          </Card>

          <Card>
            <SectionTitle>앱 설정</SectionTitle>
            <Link href="/region-settings" asChild>
              <Tappable><ListRow>지역 설정</ListRow></Tappable>
            </Link>
            <Link href="/notification-settings" asChild>
              <Tappable><ListRow>알림 설정</ListRow></Tappable>
            </Link>
            <Link href="/integration-management" asChild>
              <Tappable><ListRow>기록 연동 관리</ListRow></Tappable>
            </Link>
            <Tappable><ListRow>친구 태그 관리</ListRow></Tappable>
          </Card>

          <Card>
            <SectionTitle>출시 후 확장 예정</SectionTitle>
            <ListRow>지역 경쟁 고도화</ListRow>
            <ListRow>마켓 / 리워드</ListRow>
          </Card>

          <Tappable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </Tappable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textOnDark,
    fontSize: 24,
    fontWeight: '800',
  },
  profileMeta: { gap: 4 },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textTitle,
  },
  subline: {
    color: colors.textMuted,
  },
  tag: {
    color: colors.brandPrimary,
    fontWeight: '800',
    marginTop: 2,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.textOnDark,
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  metricLabel: {
    color: colors.textMuted,
  },
  logoutButton: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.danger,
    fontWeight: '800',
  },
});
