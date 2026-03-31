import { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { getIsSignedIn, hydrateSession } from '@/lib/session';

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#6D5EF7" />
      </View>
    );
  }

  return <Redirect href={getIsSignedIn() ? '/(tabs)/home' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
