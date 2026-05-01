import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/features/runs/backgroundTracking';
import { getIsSignedIn, hydrateSession } from '@/lib/session';

const PUBLIC_ROUTES = new Set([
  '/',
  '/onboarding',
  '/login',
  '/signup',
  '/signup-form',
  '/admin',
]);

export default function RootLayout() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6D5EF7" />
        </View>
      </SafeAreaProvider>
    );
  }

  const signedIn = getIsSignedIn();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!signedIn && !isPublicRoute) {
    return <Redirect href="/onboarding" />;
  }

  if (signedIn && isPublicRoute && pathname !== '/' && pathname !== '/admin') {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="signup-form" />
        <Stack.Screen name="login" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="connect-sources" />
        <Stack.Screen name="add-friend" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="university-verification" />
        <Stack.Screen name="region-settings" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="friend-detail" />
        <Stack.Screen name="integration-management" />
        <Stack.Screen name="my-activity" />
        <Stack.Screen name="add-run" />
        <Stack.Screen name="track-run" />
        <Stack.Screen name="run-detail" />
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
