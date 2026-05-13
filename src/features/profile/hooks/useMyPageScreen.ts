import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import type { IntegrationStatusResponse, MyActivityResponse, MyProfileResponse } from '@/lib/api/types';
import { deleteAccount, signOut } from '@/lib/session';
import { fetchIntegrationStatus, fetchMyActivity, fetchMyProfile } from '@/services';

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

  useEffect(() => {
    setError(null);
    Promise.all([fetchMyProfile(), fetchIntegrationStatus(), fetchMyActivity()])
      .then(([profileData, integrationData, activityData]) => {
        setProfile(profileData);
        setIntegrationStatus(integrationData);
        setActivity(activityData);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '마이페이지 정보를 불러오지 못했어요.'))
      .finally(() => setLoading(false));
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
      setError(logoutError instanceof Error ? logoutError.message : '로그아웃 처리에 실패했어요.');
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
      setError(deleteError instanceof Error ? deleteError.message : '회원 탈퇴 처리에 실패했어요.');
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
