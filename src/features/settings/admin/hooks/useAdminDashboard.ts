import { useEffect, useState } from 'react';
import {
  fetchAdminMarketItems,
  fetchAdminNotices,
  fetchAdminOfflineRaceEvents,
  fetchAdminOverview,
  fetchAdminRewardRedemptions,
  fetchAdminSession,
  fetchAdminUsers,
} from '@/services/adminService';
import { API_CONFIG } from '@/services/apiClient';
import { getApiErrorMessage } from '@/services/apiError';
import type { AdminOverviewResponse, AdminSessionResponse } from '@/lib/api/types';
import {
  buildRedemptionNoteDrafts,
  clearStoredAdminToken,
  readStoredAdminToken,
  writeStoredAdminToken,
} from '@/features/settings/admin/utils/adminDashboardUtils';
import { useAdminMarket } from './useAdminMarket';
import { useAdminNotices } from './useAdminNotices';
import { useAdminRaces } from './useAdminRaces';
import { useAdminRedemptions } from './useAdminRedemptions';
import { useAdminUsers } from './useAdminUsers';

// Composer: owns auth/session, the shared load/submit/error/message plumbing, and
// delegates each admin domain (notices/market/redemptions/races/users) to its sibling
// hook. The returned surface is identical to the pre-split monolith, so AdminScreen
// consumes it unchanged.
export function useAdminDashboard() {
  const [adminToken, setAdminToken] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [adminSession, setAdminSession] = useState<AdminSessionResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshOverview = async (nextToken: string) => {
    const nextOverview = await fetchAdminOverview(nextToken);
    setOverview(nextOverview);
  };

  const withSubmission = async (task: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await task();
    } catch (taskError) {
      setError(getApiErrorMessage(taskError, '관리자 작업 중 문제가 생겼어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const domainContext = { adminToken, withSubmission, refreshOverview, setMessage };
  const noticesDomain = useAdminNotices(domainContext);
  const marketDomain = useAdminMarket(domainContext);
  const redemptionsDomain = useAdminRedemptions(domainContext);
  const racesDomain = useAdminRaces(domainContext);
  const usersDomain = useAdminUsers(domainContext);

  const loadDashboardData = async (nextToken: string) => {
    const [nextOverview, nextUsers, nextNotices, nextMarketItems, nextRewardRedemptions, nextRaceEvents] = await Promise.all([
      fetchAdminOverview(nextToken),
      fetchAdminUsers(nextToken),
      fetchAdminNotices(nextToken),
      fetchAdminMarketItems(nextToken),
      fetchAdminRewardRedemptions(nextToken),
      fetchAdminOfflineRaceEvents(nextToken),
    ]);

    setOverview(nextOverview);
    usersDomain.setUsers(nextUsers.users);
    noticesDomain.setNotices(nextNotices.items);
    marketDomain.setMarketItems(nextMarketItems.items);
    redemptionsDomain.setRewardRedemptions(nextRewardRedemptions.items);
    redemptionsDomain.setRedemptionNotesById(buildRedemptionNoteDrafts(nextRewardRedemptions.items));
    racesDomain.setRaceEvents(nextRaceEvents.events);
  };

  const resetAdminDashboard = () => {
    setOverview(null);
    usersDomain.setUsers([]);
    noticesDomain.setNotices([]);
    marketDomain.setMarketItems([]);
    redemptionsDomain.setRewardRedemptions([]);
    redemptionsDomain.setRedemptionNotesById({});
    racesDomain.setRaceEvents([]);
  };

  const loadDashboard = async (nextToken = adminToken) => {
    const trimmedToken = nextToken.trim();

    if (!trimmedToken) {
      setError('관리자 토큰을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const nextSession = await fetchAdminSession(trimmedToken);
      setAdminSession(nextSession);
      await loadDashboardData(trimmedToken);
      writeStoredAdminToken(trimmedToken);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, '관리자 정보를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (nextToken = adminTokenInput) => {
    const trimmedToken = nextToken.trim();

    if (!trimmedToken) {
      setError('관리자 토큰을 입력해주세요.');
      setAuthReady(true);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const nextSession = await fetchAdminSession(trimmedToken);
      setAdminToken(trimmedToken);
      setAdminTokenInput(trimmedToken);
      setAdminSession(nextSession);
      await loadDashboardData(trimmedToken);
      writeStoredAdminToken(trimmedToken);
    } catch (loginError) {
      clearStoredAdminToken();
      resetAdminDashboard();
      setAdminToken('');
      setAdminSession(null);
      setError(getApiErrorMessage(loginError, '관리자 로그인에 실패했어요.'));
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  };

  const handleAdminLogout = () => {
    clearStoredAdminToken();
    resetAdminDashboard();
    setAdminToken('');
    setAdminTokenInput('');
    setAdminSession(null);
    setError(null);
    setMessage('관리자 로그아웃을 완료했어요.');
    setAuthReady(true);
  };

  useEffect(() => {
    const storedAdminToken = readStoredAdminToken();
    setAdminTokenInput(storedAdminToken);

    if (!storedAdminToken) {
      setAuthReady(true);
      return;
    }

    void handleAdminLogin(storedAdminToken);
    // Stored admin token bootstrap intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthenticated = Boolean(adminSession);

  return {
    adminSession,
    adminTokenInput,
    apiBaseUrl: API_CONFIG.baseUrl,
    authReady,
    editingMarketItemId: marketDomain.editingMarketItemId,
    editingNoticeId: noticesDomain.editingNoticeId,
    editingRaceEventId: racesDomain.editingRaceEventId,
    error,
    filteredMarketItems: marketDomain.filteredMarketItems,
    filteredNotices: noticesDomain.filteredNotices,
    filteredRaceEvents: racesDomain.filteredRaceEvents,
    filteredRewardRedemptions: redemptionsDomain.filteredRewardRedemptions,
    filteredUsers: usersDomain.filteredUsers,
    handleAdminLogin,
    handleAdminLogout,
    handleDeleteMarket: marketDomain.handleDeleteMarket,
    handleDeleteNotice: noticesDomain.handleDeleteNotice,
    handleDeleteRace: racesDomain.handleDeleteRace,
    handleDeleteUser: usersDomain.handleDeleteUser,
    handleSubmitMarket: marketDomain.handleSubmitMarket,
    handleSubmitNotice: noticesDomain.handleSubmitNotice,
    handleSubmitRace: racesDomain.handleSubmitRace,
    handleUpdateRedemption: redemptionsDomain.handleUpdateRedemption,
    isAuthenticated,
    loadDashboard,
    loading,
    marketFilter: marketDomain.marketFilter,
    marketForm: marketDomain.marketForm,
    marketItems: marketDomain.marketItems,
    marketQuery: marketDomain.marketQuery,
    message,
    noticeFilter: noticesDomain.noticeFilter,
    noticeForm: noticesDomain.noticeForm,
    noticeQuery: noticesDomain.noticeQuery,
    notices: noticesDomain.notices,
    overview,
    raceEvents: racesDomain.raceEvents,
    raceFilter: racesDomain.raceFilter,
    raceForm: racesDomain.raceForm,
    raceQuery: racesDomain.raceQuery,
    redemptionFilter: redemptionsDomain.redemptionFilter,
    redemptionNotesById: redemptionsDomain.redemptionNotesById,
    redemptionQuery: redemptionsDomain.redemptionQuery,
    rewardRedemptions: redemptionsDomain.rewardRedemptions,
    setAdminTokenInput,
    setEditingMarketItemId: marketDomain.setEditingMarketItemId,
    setEditingNoticeId: noticesDomain.setEditingNoticeId,
    setEditingRaceEventId: racesDomain.setEditingRaceEventId,
    setMarketFilter: marketDomain.setMarketFilter,
    setMarketForm: marketDomain.setMarketForm,
    setMarketQuery: marketDomain.setMarketQuery,
    setNoticeFilter: noticesDomain.setNoticeFilter,
    setNoticeForm: noticesDomain.setNoticeForm,
    setNoticeQuery: noticesDomain.setNoticeQuery,
    setRaceFilter: racesDomain.setRaceFilter,
    setRaceForm: racesDomain.setRaceForm,
    setRaceQuery: racesDomain.setRaceQuery,
    setRedemptionFilter: redemptionsDomain.setRedemptionFilter,
    setRedemptionNotesById: redemptionsDomain.setRedemptionNotesById,
    setRedemptionQuery: redemptionsDomain.setRedemptionQuery,
    setUserQuery: usersDomain.setUserQuery,
    submitting,
    userQuery: usersDomain.userQuery,
    users: usersDomain.users,
  };
}
