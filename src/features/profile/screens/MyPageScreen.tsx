import { StyleSheet, Text, ActivityIndicator } from 'react-native';
import { type Href } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountActionsCard } from '@/features/profile/components/AccountActionsCard';
import { MatchRecordSummaryCard } from '@/features/profile/components/MatchRecordSummaryCard';
import { ProfileSettingsCard } from '@/features/profile/components/ProfileSettingsCard';
import { ProfileSummaryCard } from '@/features/profile/components/ProfileSummaryCard';
import { UniversityVerificationCard } from '@/features/profile/components/UniversityVerificationCard';
import { useMyPageScreen } from '@/features/profile/hooks/useMyPageScreen';

export default function MyPageScreen() {
  const universityVerificationHref = '/university-verification' as Href;
  const matchRecordHref = '/match-record' as Href;
  const {
    connectedSourceCount,
    deleteConfirm,
    deleteSubmitting,
    error,
    handleDeleteAccount,
    handleLogout,
    handleShareTag,
    integrationStatus,
    loading,
    logoutConfirm,
    logoutSubmitting,
    matchSummary,
    profile,
    tagShared,
  } = useMyPageScreen();

  return (
    <Screen>
      <PageHeader title="마이페이지" />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {profile && integrationStatus ? (
        <>
          <ProfileSummaryCard
            profile={profile}
            connectedSourceCount={connectedSourceCount}
            tagShared={tagShared}
            onShareTag={handleShareTag}
          />

          <UniversityVerificationCard profile={profile} href={universityVerificationHref} />

          <IntegrationStatus sources={integrationStatus.sources} />

          <MatchRecordSummaryCard
            href={matchRecordHref}
            totalCount={matchSummary.totalCount}
            duelCount={matchSummary.duelCount}
            groupCount={matchSummary.groupCount}
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
