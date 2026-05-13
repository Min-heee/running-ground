import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import type { IntegrationStatusResponse, MyActivityResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';
import { fetchIntegrationStatus, fetchMyActivity, fetchMyProfile, getApiErrorMessage } from '@/services';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

export function useMyPageScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
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

    Promise.all([fetchMyProfile(), fetchIntegrationStatus(), fetchMyActivity()])
      .then(([profileData, integrationData, activityData]) => {
        if (canceled) {
          return;
        }

        setProfile(profileData);
        setIntegrationStatus(integrationData);
        setActivity(activityData);
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
  }, []);

  const matchSummary = useMemo(() => {
    const matchRuns = activity?.runs.filter((run) => run.matchResult) ?? [];
    const duelMatchRuns = matchRuns.filter((run) => run.matchResult?.mode === 'duel');
    const groupMatchRuns = matchRuns.filter((run) => run.matchResult?.mode === 'group');

    return {
      duelCount: duelMatchRuns.length,
      groupCount: groupMatchRuns.length,
      totalCount: matchRuns.length,
    };
  }, [activity?.runs]);

  const connectedSourceCount = useMemo(
    () => integrationStatus?.sources.filter((source) => source.connected).length ?? 0,
    [integrationStatus?.sources],
  );

  const handleShareTag = () => {
    setTagShared(true);
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
    matchSummary,
    profile,
    tagShared,
  };
}
