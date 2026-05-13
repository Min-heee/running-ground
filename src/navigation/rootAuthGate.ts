import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { getIsSignedIn, hydrateSession } from '@/lib/session';

const PUBLIC_ROUTES = new Set([
  '/',
  '/onboarding',
  '/login',
  '/account-recovery',
  '/signup',
  '/signup-form',
  '/admin',
]);

export function useRootAuthGate() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateSession().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return {
      ready,
      redirectHref: null,
    };
  }

  const signedIn = getIsSignedIn();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!signedIn && !isPublicRoute) {
    return {
      ready,
      redirectHref: '/onboarding' as const,
    };
  }

  if (signedIn && isPublicRoute && pathname !== '/' && pathname !== '/admin') {
    return {
      ready,
      redirectHref: '/(tabs)/home' as const,
    };
  }

  return {
    ready,
    redirectHref: null,
  };
}
