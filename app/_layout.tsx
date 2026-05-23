import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/features/runs/tracking/background';
import { useConfigureNotificationHandler } from '@/navigation/notificationHandler';
import { useRootAuthGate } from '@/navigation/rootAuthGate';
import { logRgEnvironmentOnce } from '@/utils/rgEnvTrace';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export default function RootLayout() {
  const { ready, redirectHref } = useRootAuthGate();
  const didLogEnvironmentRef = useRef(false);
  useConfigureNotificationHandler();

  useEffect(() => {
    rgPerfMark('app root layout mounted', {
      source: 'root layout',
    });
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
        <Stack.Screen name="login" />
        <Stack.Screen name="account-recovery" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="connect-sources" />
        <Stack.Screen name="add-friend" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="university-verification" />
        <Stack.Screen name="region-settings" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="match-room" />
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
