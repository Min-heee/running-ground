import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { getIsSignedIn, hydrateSession } from '@/lib/session';
import { isAdminRouteEnabled } from '@/utils/rgEnvTrace';

const PUBLIC_ROUTES = new Set([
  '/',
  '/onboarding',
  '/login',
  '/account-recovery',
  '/signup',
  '/signup-form',
]);

// /admin is a dev/preview-only deep link. In production the route renders as not-found, so the
// auth gate must treat the pathname like any other unknown route (no public-route exemption).
function isPublicRoutePathname(pathname: string) {
  if (pathname === '/admin') {
    return isAdminRouteEnabled();
  }

  return PUBLIC_ROUTES.has(pathname);
}

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
  const isPublicRoute = isPublicRoutePathname(pathname);

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
