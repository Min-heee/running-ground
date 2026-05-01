import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { type Href, Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchIntegrationStatus, fetchMyProfile } from '@/lib/api/services';
import { IntegrationStatusResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';

export default function MyPageScreen() {
  const universityVerificationHref = '/university-verification' as Href;
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
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
    Promise.all([fetchMyProfile(), fetchIntegrationStatus()])
      .then(([profileData, integrationData]) => {
        setProfile(profileData);
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

  return (
    <Screen>
      <PageHeader title="마이페이지" />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {profile && integrationStatus ? (
        <>
          <Card style={styles.profileCard}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile.name.slice(0, 1)}</Text>
              </View>
              <View style={styles.profileMeta}>
                <Text style={styles.name}>{profile.name}</Text>
                <Text style={styles.subline}>
                  {[profile.districtName, profile.universityName].filter(Boolean).join(' · ') || '대학교 인증 전'}
                </Text>
              </View>
            </View>
            <View style={styles.profileTagRow}>
              <Text style={styles.tagLabel}>공개 태그</Text>
              <Text style={styles.tag}>{profile.publicTag}</Text>
            </View>
            <Text style={styles.profileHint}>연결된 소스 {integrationStatus.sources.filter((source) => source.connected).length}개</Text>
            <View style={styles.inlineActions}>
              <Link href="/edit-profile" asChild>
                <Pressable style={styles.inlineActionButton}>
                  <Text style={styles.inlineActionText}>프로필 수정</Text>
                </Pressable>
              </Link>
              <Pressable style={styles.inlineActionButton} onPress={handleShareTag}>
                <Text style={styles.inlineActionText}>{tagShared ? '복사 준비됨' : '내 태그 공유'}</Text>
              </Pressable>
            </View>
          </Card>

          <Link href={universityVerificationHref} asChild>
            <Pressable>
              <Card style={styles.universityCard}>
                <View style={styles.sectionHeaderRow}>
                  <SectionTitle>대학교 인증</SectionTitle>
                  <Text style={styles.sectionLink}>관리</Text>
                </View>
                <Text style={styles.universityVerificationStatusValue}>
                  {profile.universityName ? `${profile.universityName} 연결됨` : '아직 인증 전'}
                </Text>
                <Text style={styles.universityVerificationHint}>재학증명서 또는 에브리타임 방식</Text>
              </Card>
            </Pressable>
          </Link>

          <IntegrationStatus sources={integrationStatus.sources} />

          <Card style={styles.settingsCard}>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>설정</SectionTitle>
              <Text style={styles.sectionLink}>3개</Text>
            </View>
            <Link href="/region-settings" asChild>
              <Pressable style={styles.settingRow}>
                <Text style={styles.settingLabel}>지역 설정</Text>
                <Text style={styles.settingValue}>변경</Text>
              </Pressable>
            </Link>
            <Link href="/notification-settings" asChild>
              <Pressable style={styles.settingRow}>
                <Text style={styles.settingLabel}>알림 설정</Text>
                <Text style={styles.settingValue}>관리</Text>
              </Pressable>
            </Link>
            <Link href="/integration-management" asChild>
              <Pressable style={styles.settingRow}>
                <Text style={styles.settingLabel}>기록 연동 관리</Text>
                <Text style={styles.settingValue}>열기</Text>
              </Pressable>
            </Link>
          </Card>

          <Card style={styles.dangerCard}>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>계정</SectionTitle>
              <Text style={styles.sectionLink}>로그아웃 / 탈퇴</Text>
            </View>
            <View style={styles.accountActionRow}>
              <Pressable
                disabled={logoutSubmitting || deleteSubmitting}
                style={[
                  styles.logoutButton,
                  (logoutSubmitting || deleteSubmitting) ? styles.disabledButton : null,
                ]}
                onPress={handleLogout}
              >
                <Text style={styles.logoutButtonText}>
                  {logoutSubmitting ? '로그아웃 중...' : logoutConfirm ? '다시 누르면 로그아웃' : '로그아웃'}
                </Text>
              </Pressable>
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
                      ? '다시 누르면 탈퇴'
                      : '회원 탈퇴'}
                </Text>
              </Pressable>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    gap: 12,
    paddingTop: 16,
    paddingBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 99,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  profileMeta: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#101828',
  },
  subline: {
    color: '#667085',
  },
  profileTagRow: {
    gap: 4,
  },
  tagLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  tag: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  profileHint: {
    fontSize: 12,
    color: '#667085',
    fontWeight: '700',
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineActionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  inlineActionText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionLink: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  universityCard: {
    gap: 6,
  },
  universityVerificationStatusValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  universityVerificationHint: {
    color: '#667085',
    lineHeight: 18,
    fontSize: 12,
  },
  errorText: {
    color: '#D92D20',
    fontWeight: '600',
    lineHeight: 20,
  },
  settingsCard: {
    gap: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECF0',
  },
  settingLabel: {
    color: '#111827',
    fontWeight: '700',
  },
  settingValue: {
    color: '#667085',
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  logoutButtonText: {
    color: '#111827',
    fontWeight: '800',
  },
  dangerCard: {
    gap: 10,
  },
  accountActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteButton: {
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FDA29B',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  deleteButtonText: {
    color: '#D92D20',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
