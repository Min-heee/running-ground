import { Redirect } from 'expo-router';
import { getIsSignedIn } from '@/lib/session';

export default function Index() {
  return <Redirect href={getIsSignedIn() ? '/(tabs)/home' : '/onboarding'} />;
}
