import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, ActivityIndicator } from 'react-native';
import { type Href } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountActionsCard } from '@/features/profile/components/AccountActionsCard';
import { MatchRecordSummaryCard } from '@/features/profile/components/MatchRecordSummaryCard';
import { ProfileEnvironmentDebugCard } from '@/features/profile/components/ProfileEnvironmentDebugCard';
import { ProfileSettingsCard } from '@/features/profile/components/ProfileSettingsCard';
import { ProfileSummaryCard } from '@/features/profile/components/ProfileSummaryCard';
import { UniversityVerificationCard } from '@/features/profile/components/UniversityVerificationCard';
import { useMyPageScreen } from '@/features/profile/hooks/useMyPageScreen';
import { shouldShowRgEnvironmentDebugByDefault } from '@/utils/rgEnvTrace';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors } from '@/theme/tokens';

export default function MyPageScreen() {
  useTabWarmupTrace('mypage');
  const universityVerificationHref = '/university-verification' as Href;
  const matchRecordHref = '/match-record' as Href;
  const showDebugByDefault = useMemo(() => shouldShowRgEnvironmentDebugByDefault(), []);
  const [showEnvironmentDebug, setShowEnvironmentDebug] = useState(showDebugByDefault);
  const [, setEnvironmentDebugTapCount] = useState(0);
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
  const handleEnvironmentDebugUnlock = useCallback(() => {
    if (showEnvironmentDebug) {
      return;
    }

    setEnvironmentDebugTapCount((currentCount) => {
      const nextCount = currentCount + 1;

      if (nextCount >= 5) {
        setShowEnvironmentDebug(true);
      }

      return nextCount;
    });
  }, [showEnvironmentDebug]);

  return (
    <Screen>
      <PageHeader title="마이페이지" />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
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

          <ProfileSettingsCard onDebugUnlockPress={handleEnvironmentDebugUnlock} />

          {showEnvironmentDebug ? <ProfileEnvironmentDebugCard profile={profile} /> : null}

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
    color: colors.dangerBright,
    fontWeight: '600',
    lineHeight: 20,
  },
});
