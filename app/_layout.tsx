import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/features/runs/tracking/background';
import { setUnauthorizedHandler } from '@/services/apiClient';
import { clearSession, getBackendAccessToken } from '@/lib/session/sessionState';
import { initializeLiveGapPushConfigPersistence } from '@/features/runs/liveGap/liveGapPushConfigPersistence';
import { useConfigureNotificationHandler } from '@/navigation/notificationHandler';
import { useRootAuthGate } from '@/navigation/rootAuthGate';
import { colors, getAppliedThemeMode } from '@/theme/tokens';
import { hydrateThemePalette } from '@/theme/themeMode';
import { logRgEnvironmentOnce } from '@/utils/rgEnvTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { initSentryOnce } from '@/observability/sentry';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

// Module scope on purpose: crash reporting must be armed before the first
// render, or a crash during startup is exactly the one we never see.
initSentryOnce();

export default function RootLayout() {
  const { ready, redirectHref } = useRootAuthGate();
  // Theme gate: the stored mode must be applied to the mutable `colors` object
  // BEFORE any route module is imported (their StyleSheets bake at import). Routes
  // load lazily behind this gate, so blocking here is sufficient.
  const [themeReady, setThemeReady] = useState(false);
  const didLogEnvironmentRef = useRef(false);
  useConfigureNotificationHandler();

  useEffect(() => {
    hydrateThemePalette()
      .catch(() => {
        // Palette hydration must never block boot — fall through on the dark default.
      })
      .finally(() => setThemeReady(true));
  }, []);

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

  if (!ready || !themeReady) {
    // Pre-gate loader: the stored mode is not known yet, so this always renders on
    // the dark default palette (matches the dark splash) — read colors at render
    // time rather than from a module-baked StyleSheet to keep that explicit.
    return (
      <SafeAreaProvider>
        <View style={[styles.loaderWrap, { backgroundColor: colors.surfaceApp }]}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (redirectHref) {
    return <Redirect href={redirectHref} />;
  }

  return (
    <SafeAreaProvider>
      {/* Bar style follows the applied theme: dark surfaces need light glyphs and
          vice versa. Evaluated at render time (post-gate), not baked at import. */}
      <StatusBar style={getAppliedThemeMode() === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="signup-form" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="account-recovery" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="add-friend" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="region-settings" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="notification-center" />
        <Stack.Screen name="match-room" />
        <Stack.Screen name="duel-reservation" />
        <Stack.Screen name="group-reservation" />
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
  },
});
