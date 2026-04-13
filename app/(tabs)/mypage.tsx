import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListRow } from '@/components/ui/ListRow';
import { fetchHomeSummary, fetchIntegrationStatus, fetchMyActivity, fetchMyProfile } from '@/lib/api/services';
import { HomeSummaryResponse, IntegrationStatusResponse, MyActivityResponse, MyProfileResponse } from '@/lib/api/types';
import { signOut } from '@/lib/session';
import { buildWeeklyPointOverview } from '@/features/points/pointSystem';

export default function MyPageScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [summary, setSummary] = useState<HomeSummaryResponse | null>(null);
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagShared, setTagShared] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchHomeSummary(), fetchMyActivity(), fetchIntegrationStatus()])
      .then(([profileData, summaryData, activityData, integrationData]) => {
        setProfile(profileData);
        setSummary(summaryData);
        setActivity(activityData);
        setIntegrationStatus(integrationData);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleShareTag = () => {
    setTagShared(true);
    setTimeout(() => setTagShared(false), 1500);
  };

  const handleLogout = async () => {
    if (!logoutConfirm) {
      setLogoutConfirm(true);
      return;
    }

    await signOut();
    router.replace('/onboarding');
  };

  const connectedCount = integrationStatus?.sources.filter((source) => source.connected).length ?? 0;
  const pointOverview = summary ? buildWeeklyPointOverview(summary, { lifetimeDistanceKm: profile?.lifetimeDistanceKm, runs: activity?.runs ?? [] }) : null;

  return (
    <Screen>
      <PageHeader title="마이페이지" subtitle="내 프로필, 활동 요약, 연동 상태와 설정을 한 번에 관리." />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {profile && summary && integrationStatus ? (
        <>
          <Card style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.subline}>
                {[profile.districtName, profile.universityName, '러닝 경쟁 진행 중'].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.tag}>{profile.publicTag}</Text>
            </View>
          </Card>

          <View style={styles.profileActions}>
            <Link href="/edit-profile" asChild>
              <Pressable style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>프로필 수정</Text>
              </Pressable>
            </Link>
            <Pressable style={styles.secondaryAction} onPress={handleShareTag}>
              <Text style={styles.secondaryActionText}>{tagShared ? '공유 준비됨' : '내 태그 공유'}</Text>
            </Pressable>
          </View>

          <Link href="/my-activity" asChild>
            <Pressable>
              <Card>
                <SectionTitle>내 활동</SectionTitle>
                <View style={styles.metricRow}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricValue}>{summary.totalDistanceKm}km</Text>
                    <Text style={styles.metricLabel}>이번 주 거리</Text>
                  </View>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricValue}>Lv.{pointOverview?.distanceLevel ?? 0}</Text>
                    <Text style={styles.metricLabel}>거리 레벨</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          </Link>

          {pointOverview ? (
            <Card>
              <SectionTitle>포인트 시스템</SectionTitle>
              <View style={styles.pointSummaryRow}>
                <Text style={styles.pointSummaryValue}>Lv.{pointOverview.distanceLevel}</Text>
                <Text style={styles.pointSummaryMeta}>누적 거리 {pointOverview.lifetimeDistanceKm}km</Text>
              </View>

              <View style={styles.ruleList}>
                {pointOverview.tracks.map((track) => (
                  <View key={track.id} style={styles.ruleCard}>
                    <View style={styles.ruleHeader}>
                      <Text style={styles.ruleTitle}>{track.label}</Text>
                      <Text style={styles.rulePoints}>
                        {track.id === 'streak'
                          ? `다음 +${track.rewardPoints}P`
                          : track.scope === 'lifetime'
                            ? `레벨업 +${track.rewardPoints}P`
                            : `달성 +${track.rewardPoints}P`}
                      </Text>
                    </View>
                    {track.badgeText ? <Text style={styles.ruleBadge}>{track.badgeText}</Text> : null}
                    <Text style={styles.ruleDetail}>
                      {track.id === 'streak'
                        ? `${track.currentValue}${track.unit} 연속`
                        : `${track.currentValue} / ${track.targetValue}${track.unit}`}
                    </Text>
                    <View style={styles.pointTrack}>
                      <View style={[styles.pointFill, { width: `${track.progressPercent}%` }]} />
                    </View>
                    {track.helperText ? <Text style={styles.ruleHelper}>{track.helperText}</Text> : null}
                    <Text style={styles.ruleStatus}>{track.statusText}</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

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
              <Pressable><ListRow>지역 설정</ListRow></Pressable>
            </Link>
            <Link href="/notification-settings" asChild>
              <Pressable><ListRow>알림 설정</ListRow></Pressable>
            </Link>
            <Link href="/integration-management" asChild>
              <Pressable><ListRow>기록 연동 관리</ListRow></Pressable>
            </Link>
            <Pressable><ListRow>친구 태그 관리</ListRow></Pressable>
          </Card>

          <Card>
            <SectionTitle>출시 후 확장 예정</SectionTitle>
            <ListRow>지역 경쟁 고도화</ListRow>
            <ListRow>마켓 / 리워드</ListRow>
          </Card>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>{logoutConfirm ? '한 번 더 누르면 로그아웃' : '로그아웃'}</Text>
          </Pressable>
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
    borderRadius: 99,
    backgroundColor: '#6D5EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  profileMeta: { gap: 4 },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#101828',
  },
  subline: {
    color: '#667085',
  },
  tag: {
    color: '#6D5EF7',
    fontWeight: '800',
    marginTop: 2,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: '#6D5EF7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryActionText: {
    color: '#111827',
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  metricLabel: {
    color: '#667085',
  },
  pointSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  pointSummaryValue: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
  },
  pointSummaryMeta: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  pointTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginTop: 12,
  },
  pointFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  ruleList: {
    gap: 10,
    marginTop: 14,
  },
  ruleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  ruleTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  rulePoints: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  ruleDetail: {
    color: '#667085',
    lineHeight: 20,
  },
  ruleBadge: {
    alignSelf: 'flex-start',
    color: '#111827',
    backgroundColor: '#EEF2F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
    marginTop: 2,
  },
  ruleHelper: {
    color: '#667085',
    lineHeight: 20,
  },
  ruleStatus: {
    color: '#111827',
    fontWeight: '700',
    lineHeight: 20,
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F04438',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#F04438',
    fontWeight: '800',
  },
});
