import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { getIsSignedIn, hydrateSession } from '@/lib/session';
import { startAppIconBadgeSync, syncAppIconBadgeFromServer } from '@/lib/push/appBadge';
import { syncPushRegistration } from '@/lib/push/pushRegistration';
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
    hydrateSession().finally(() => {
      setReady(true);
      // 공지 푸시 대상 등록 — 실패는 내부에서 삼킨다 (권한 거절/자격증명 없는 빌드).
      void syncPushRegistration();
      // 앱 아이콘 배지: 포그라운드 전환마다 서버 unreadCount로 재동기화하는 리스너.
      startAppIconBadgeSync();
    });
  }, []);

  // 로그인 상태가 켜지는 순간(부팅 복원 + 세션 내 로그인 모두) 아이콘 배지를 맞춘다.
  const signedInNow = ready && getIsSignedIn();

  useEffect(() => {
    if (signedInNow) {
      void syncAppIconBadgeFromServer();
    }
  }, [signedInNow]);

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
