import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { TabHeader } from '@/components/ui/TabHeader';
import { AccountActionsCard } from '@/features/profile/components/AccountActionsCard';
import { ProfileEnvironmentDebugCard } from '@/features/profile/components/ProfileEnvironmentDebugCard';
import { ProfileSettingsCard } from '@/features/profile/components/ProfileSettingsCard';
import { ProfileSummaryCard } from '@/features/profile/components/ProfileSummaryCard';
import { useMyPageScreen } from '@/features/profile/hooks/useMyPageScreen';
import { shouldShowRgEnvironmentDebugByDefault } from '@/utils/rgEnvTrace';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, fontWeights } from '@/theme/tokens';

export default function MyPageScreen() {
  useTabWarmupTrace('mypage');
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

  if (loading) {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <TabHeader title="마이" />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {profile && integrationStatus ? (
        <>
          <ProfileSummaryCard
            profile={profile}
            connectedSourceCount={connectedSourceCount}
            tagShared={tagShared}
            onShareTag={handleShareTag}
          />

          <IntegrationStatus sources={integrationStatus.sources} />

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
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
