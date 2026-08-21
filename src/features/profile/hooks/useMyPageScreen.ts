import { useRef, useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';
import { fetchMyProfile, getApiErrorMessage } from '@/services';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const MYPAGE_INITIAL_FETCH_DEFER_MS = 120;

// 앱 다운로드 링크 — 우리 도메인 리다이렉트(GET /download)를 쓴다: iOS에서는
// itms-apps 스킴 302로 카톡 인앱 브라우저에서도 App Store 앱이 바로 열린다.
// (apps.apple.com 직링크는 인앱 브라우저가 웹 스토어 페이지를 먼저 띄웠음.)
const APP_STORE_URL = 'https://api.running-ground.com/download';

export function useMyPageScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
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

    // 연동 상태 fetch는 "연결된 소스" 카드 은퇴와 함께 제거 — 마이페이지는
    // 프로필 하나만 부른다 (가져오기는 연동관리 화면에서 연결 상태와 무관하게 동작).
    fetchMyProfile()
      .then((profileData) => {
        if (canceled) {
          return;
        }

        setProfile(profileData);
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

  // Opens the system share sheet with the tag; falls back to a clipboard copy
  // when sharing is unavailable. (This used to be a stub that only flipped the
  // button label for 1.5s and shared nothing.)
  const handleShareTag = async () => {
    const tag = profile?.publicTag;
    if (!tag) {
      return;
    }

    try {
      // 태그를 링크에 실으면: 앱 설치자는 링크 탭 → 딥링크로 친구 추가 화면(자동 신청),
      // 미설치자는 같은 링크에서 스토어로 넘어간다 (GET /download?tag= 스마트 랜딩).
      const tagCode = tag.replace(/^#/, '');
      await Share.share({
        // 안드로이드 정식 출시 후 Play 링크(또는 랜딩 페이지)로 확장 예정.
        message: `러닝스페이스에서 같이 달려요! 내 친구 태그: ${tag}\n앱에서 바로 친구 추가: ${APP_STORE_URL}?tag=${tagCode}`,
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
    deleteConfirm,
    deleteSubmitting,
    error,
    handleDeleteAccount,
    handleLogout,
    handleShareTag,
    loading,
    logoutConfirm,
    logoutSubmitting,
    profile,
    tagShared,
  };
}
