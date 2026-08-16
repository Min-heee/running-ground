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
  // 우주는 사이트로 나간다 (오너 2026-08-16: "사이트로 내고싶은거여서 앱에는 안넣을거야").
  // 로그인 없이 전국을 둘러볼 수 있고, 자기 별을 가지려면 그때 로그인한다.
  '/universe',
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

  // 로그인한 사람도 우주에는 그대로 머문다 — 공개 경로지만 '가입 유도 화면'이 아니라
  // 목적지 그 자체라서, 홈으로 돌려보내면 링크를 눌러 들어온 사람이 우주를 못 본다.
  if (signedIn && isPublicRoute && pathname !== '/' && pathname !== '/admin' && pathname !== '/universe') {
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
