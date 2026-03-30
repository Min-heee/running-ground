import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="signup-form" />
      <Stack.Screen name="login" />
      <Stack.Screen name="connect-sources" />
      <Stack.Screen name="add-friend" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="region-settings" />
      <Stack.Screen name="notification-settings" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
