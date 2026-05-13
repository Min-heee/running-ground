import { useEffect, useState } from 'react';
import { StyleSheet, Text, ActivityIndicator } from 'react-native';
import { type Href, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountActionsCard } from '@/features/profile/components/AccountActionsCard';
import { MatchRecordSummaryCard } from '@/features/profile/components/MatchRecordSummaryCard';
import { ProfileSettingsCard } from '@/features/profile/components/ProfileSettingsCard';
import { ProfileSummaryCard } from '@/features/profile/components/ProfileSummaryCard';
import { UniversityVerificationCard } from '@/features/profile/components/UniversityVerificationCard';
import { fetchIntegrationStatus, fetchMyActivity, fetchMyProfile } from '@/services';
import { IntegrationStatusResponse, MyActivityResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';

export default function MyPageScreen() {
  const universityVerificationHref = '/university-verification' as Href;
  const matchRecordHref = '/match-record' as Href;
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagShared, setTagShared] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchMyProfile(), fetchIntegrationStatus(), fetchMyActivity()])
      .then(([profileData, integrationData, activityData]) => {
        setProfile(profileData);
        setIntegrationStatus(integrationData);
        setActivity(activityData);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '마이페이지 정보를 불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  const matchRuns = activity?.runs.filter((run) => run.matchResult) ?? [];
  const duelMatchRuns = matchRuns.filter((run) => run.matchResult?.mode === 'duel');
  const groupMatchRuns = matchRuns.filter((run) => run.matchResult?.mode === 'group');

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
          <ProfileSummaryCard
            profile={profile}
            connectedSourceCount={integrationStatus.sources.filter((source) => source.connected).length}
            tagShared={tagShared}
            onShareTag={handleShareTag}
          />

          <UniversityVerificationCard profile={profile} href={universityVerificationHref} />

          <IntegrationStatus sources={integrationStatus.sources} />

          <MatchRecordSummaryCard
            href={matchRecordHref}
            totalCount={matchRuns.length}
            duelCount={duelMatchRuns.length}
            groupCount={groupMatchRuns.length}
          />

          <ProfileSettingsCard />

          <AccountActionsCard
            logoutConfirm={logoutConfirm}
            deleteConfirm={deleteConfirm}
            logoutSubmitting={logoutSubmitting}
            deleteSubmitting={deleteSubmitting}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#D92D20',
    fontWeight: '600',
    lineHeight: 20,
  },
});
