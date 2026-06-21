import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/features/runs/tracking/background';
import { setUnauthorizedHandler } from '@/services/apiClient';
import { clearSession, getBackendAccessToken } from '@/lib/session/sessionState';
import { initializeLiveGapPushConfigPersistence } from '@/features/runs/liveGap/liveGapPushConfigPersistence';
import { useConfigureNotificationHandler } from '@/navigation/notificationHandler';
import { useRootAuthGate } from '@/navigation/rootAuthGate';
import { logRgEnvironmentOnce } from '@/utils/rgEnvTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function RootLayout() {
  const { ready, redirectHref } = useRootAuthGate();
  const didLogEnvironmentRef = useRef(false);
  useConfigureNotificationHandler();

  useEffect(() => {
    rgPerfMark('app root layout mounted', {
      source: 'root layout',
    });
    // Restore the saved live-gap push options (if the user opted in) and start mirroring
    // future changes to device storage. Device-level preference, so it runs once at mount
    // independently of the auth gate.
    void initializeLiveGapPushConfigPersistence();
  }, []);

  useEffect(() => {
    // Single active session: when an authenticated request comes back 401 — most
    // commonly because this account just logged in on another device — clear the local
    // session and return to onboarding. `signingOut` + the token check dedupe the burst
    // of 401s a polling app fires so we only sign out once per invalidation.
    let signingOut = false;
    setUnauthorizedHandler(() => {
      if (signingOut || !getBackendAccessToken()) {
        return;
      }
      signingOut = true;
      void (async () => {
        try {
          await clearSession();
          router.replace('/onboarding');
        } finally {
          signingOut = false;
        }
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!ready || didLogEnvironmentRef.current) {
      return;
    }

    didLogEnvironmentRef.current = true;
    rgPerfMark('app root layout ready', {
      source: 'root layout',
    });
    logRgEnvironmentOnce();
  }, [ready]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6D5EF7" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="signup-form" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="account-recovery" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="connect-sources" />
        <Stack.Screen name="add-friend" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="region-settings" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="notification-center" />
        <Stack.Screen name="match-room" />
        <Stack.Screen name="opponent-profile" />
        <Stack.Screen name="friend-detail" />
        <Stack.Screen name="integration-management" />
        <Stack.Screen name="my-activity" />
        <Stack.Screen name="add-run" />
        <Stack.Screen name="track-run" />
        <Stack.Screen name="run-detail" />
        <Stack.Screen name="match-result" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
