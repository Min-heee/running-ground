import { useMemo, useRef, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { IntegrationStatusResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';
import { fetchIntegrationStatus, fetchMyProfile, getApiErrorMessage } from '@/services';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const MYPAGE_INITIAL_FETCH_DEFER_MS = 120;

// 러닝그라운드 앱스토어 페이지 — 태그 공유 메시지에 실린다.
const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6762328694';

export function useMyPageScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagShared, setTagShared] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useAndroidDeferredEffect(() => {
    let canceled = false;

    setError(null);
    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    Promise.all([fetchMyProfile(), fetchIntegrationStatus()])
      .then(([profileData, integrationData]) => {
        if (canceled) {
          return;
        }

        setProfile(profileData);
        setIntegrationStatus(integrationData);
      })
      .catch((loadError) => {
        if (!canceled) {
          setError(getApiErrorMessage(loadError, '마이페이지 정보를 불러오지 못했어요.'));
        }
      })
      .finally(() => {
        if (!canceled) {
          hasLoadedRef.current = true;
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [], {
    delayMs: MYPAGE_INITIAL_FETCH_DEFER_MS,
    source: 'mypage screen model',
    tab: 'mypage',
    traceInitialFetch: true,
    work: 'mypage data fetch',
  });

  const connectedSourceCount = useMemo(
    () => integrationStatus?.sources.filter((source) => source.connected).length ?? 0,
    [integrationStatus?.sources],
  );

  // Opens the system share sheet with the tag; falls back to a clipboard copy
  // when sharing is unavailable. (This used to be a stub that only flipped the
  // button label for 1.5s and shared nothing.)
  const handleShareTag = async () => {
    const tag = profile?.publicTag;
    if (!tag) {
      return;
    }

    try {
      await Share.share({
        // 안드로이드 정식 출시 후 Play 링크(또는 랜딩 페이지)로 확장 예정.
        message: `러닝그라운드에서 같이 달려요! 내 친구 태그: ${tag}\n앱 다운로드: ${APP_STORE_URL}`,
      });
      setTagShared(true);
    } catch {
      try {
        await Clipboard.setStringAsync(tag);
        setTagShared(true);
      } catch {
        // Neither share nor clipboard worked — leave the label unchanged.
      }
    }

    setTimeout(() => setTagShared(false), 1500);
  };

  const handleLogout = async () => {
    if (!logoutConfirm) {
      setDeleteConfirm(false);
      setLogoutConfirm(true);
      return;
    }

    setError(null);
    setLogoutSubmitting(true);

    try {
      await signOut();
      router.replace('/onboarding');
    } catch (logoutError) {
      setError(getApiErrorMessage(logoutError, '로그아웃 처리에 실패했어요.'));
    } finally {
      setLogoutSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setLogoutConfirm(false);
      setDeleteConfirm(true);
      return;
    }

    setError(null);
    setDeleteSubmitting(true);

    try {
      await deleteAccount();
      router.replace('/onboarding');
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, '회원 탈퇴 처리에 실패했어요.'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return {
    connectedSourceCount,
    deleteConfirm,
    deleteSubmitting,
    error,
    handleDeleteAccount,
    handleLogout,
    handleShareTag,
    integrationStatus,
    loading,
    logoutConfirm,
    logoutSubmitting,
    profile,
    tagShared,
  };
}
