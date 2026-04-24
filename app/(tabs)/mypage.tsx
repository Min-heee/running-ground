import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListRow } from '@/components/ui/ListRow';
import { fetchHomeSummary, fetchIntegrationStatus, fetchMyProfile } from '@/lib/api/services';
import { HomeSummaryResponse, IntegrationStatusResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';

export default function MyPageScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [summary, setSummary] = useState<HomeSummaryResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagShared, setTagShared] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchMyProfile(), fetchHomeSummary(), fetchIntegrationStatus()])
      .then(([profileData, summaryData, integrationData]) => {
        setProfile(profileData);
        setSummary(summaryData);
        setIntegrationStatus(integrationData);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '마이페이지 정보를 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  const handleShareTag = () => {
    setTagShared(true);
    setTimeout(() => setTagShared(false), 1500);
  };

  const handleLogout = async () => {
    if (!logoutConfirm) {
      setDeleteConfirm(false);
      setLogoutConfirm(true);
      return;
    }

    setError(null);
    setLogoutSubmitting(true);

    try {
      await signOut();
      router.replace('/onboarding');
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : '로그아웃 처리에 실패했어요.');
    } finally {
      setLogoutSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setLogoutConfirm(false);
      setDeleteConfirm(true);
      return;
    }

    setError(null);
    setDeleteSubmitting(true);

    try {
      await deleteAccount();
      router.replace('/onboarding');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '회원 탈퇴 처리에 실패했어요.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const connectedCount = integrationStatus?.sources.filter((source) => source.connected).length ?? 0;
  return (
    <Screen>
      <PageHeader title="마이페이지" />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
                    <Text style={styles.metricValue}>{summary.totalRuns}회</Text>
                    <Text style={styles.metricLabel}>이번 주 러닝</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
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

          <Card style={styles.dangerCard}>
            <SectionTitle>회원 탈퇴</SectionTitle>
            <Text style={styles.dangerDescription}>
              탈퇴하면 러닝 기록, 친구 관계, 참가 신청과 교환 내역이 함께 삭제돼요.
            </Text>
            <Pressable
              disabled={deleteSubmitting || logoutSubmitting}
              style={[
                styles.deleteButton,
                (deleteSubmitting || logoutSubmitting) ? styles.disabledButton : null,
              ]}
              onPress={handleDeleteAccount}
            >
              <Text style={styles.deleteButtonText}>
                {deleteSubmitting
                  ? '탈퇴 처리 중...'
                  : deleteConfirm
                    ? '한 번 더 누르면 회원 탈퇴'
                    : '회원 탈퇴'}
              </Text>
            </Pressable>
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

          <Pressable
            disabled={logoutSubmitting || deleteSubmitting}
            style={[
              styles.logoutButton,
              (logoutSubmitting || deleteSubmitting) ? styles.disabledButton : null,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>
              {logoutSubmitting ? '로그아웃 중...' : logoutConfirm ? '한 번 더 누르면 로그아웃' : '로그아웃'}
            </Text>
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
  errorText: {
    color: '#D92D20',
    fontWeight: '600',
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
  dangerCard: {
    gap: 12,
  },
  dangerDescription: {
    color: '#667085',
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FDA29B',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#D92D20',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
