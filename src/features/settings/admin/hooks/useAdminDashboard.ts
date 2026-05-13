import { useEffect, useMemo, useState } from 'react';
import {
  createAdminNotice,
  createAdminMarketItem,
  createAdminOfflineRaceEvent,
  deleteAdminNotice,
  deleteAdminMarketItem,
  deleteAdminOfflineRaceEvent,
  deleteAdminUser,
  fetchAdminMarketItems,
  fetchAdminNotices,
  fetchAdminOfflineRaceEvents,
  fetchAdminOverview,
  fetchAdminRewardRedemptions,
  fetchAdminSession,
  fetchAdminUsers,
  updateAdminNotice,
  updateAdminMarketItem,
  updateAdminOfflineRaceEvent,
  updateAdminRewardRedemption,
} from '@/services/adminService';
import { API_CONFIG } from '@/services/apiClient';
import type {
  AdminNotice,
  AdminMarketItem,
  AdminOfflineRaceEvent,
  AdminOverviewResponse,
  AdminRewardRedemption,
  AdminSessionResponse,
  AdminUserSummary,
} from '@/lib/api/types';
import type { MarketFormState, NoticeFormState, RaceFormState } from '@/features/settings/admin/types';
import {
  buildRedemptionNoteDrafts,
  clearStoredAdminToken,
  confirmAction,
  createEmptyMarketForm,
  createEmptyNoticeForm,
  createEmptyRaceForm,
  filterAdminMarketItems,
  filterAdminNotices,
  filterAdminRaceEvents,
  filterAdminRewardRedemptions,
  filterAdminUsers,
  getRewardStatusLabel,
  readStoredAdminToken,
  writeStoredAdminToken,
} from '@/features/settings/admin/utils/adminDashboardUtils';

export function useAdminDashboard() {
  const [adminToken, setAdminToken] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [adminSession, setAdminSession] = useState<AdminSessionResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [noticeForm, setNoticeForm] = useState<NoticeFormState>(createEmptyNoticeForm);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeQuery, setNoticeQuery] = useState('');
  const [noticeFilter, setNoticeFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [marketItems, setMarketItems] = useState<AdminMarketItem[]>([]);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [rewardRedemptions, setRewardRedemptions] = useState<AdminRewardRedemption[]>([]);
  const [redemptionNotesById, setRedemptionNotesById] = useState<Record<string, string>>({});
  const [redemptionQuery, setRedemptionQuery] = useState('');
  const [redemptionFilter, setRedemptionFilter] = useState<'all' | 'requested' | 'fulfilled' | 'cancelled'>('all');
  const [raceEvents, setRaceEvents] = useState<AdminOfflineRaceEvent[]>([]);
  const [raceQuery, setRaceQuery] = useState('');
  const [raceFilter, setRaceFilter] = useState<'all' | 'active' | 'finished'>('all');
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [marketForm, setMarketForm] = useState<MarketFormState>(createEmptyMarketForm);
  const [editingMarketItemId, setEditingMarketItemId] = useState<string | null>(null);
  const [raceForm, setRaceForm] = useState<RaceFormState>(createEmptyRaceForm);
  const [editingRaceEventId, setEditingRaceEventId] = useState<string | null>(null);

  const refreshOverview = async (nextToken: string) => {
    const nextOverview = await fetchAdminOverview(nextToken);
    setOverview(nextOverview);
  };

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
    setUsers(nextUsers.users);
    setNotices(nextNotices.items);
    setMarketItems(nextMarketItems.items);
    setRewardRedemptions(nextRewardRedemptions.items);
    setRedemptionNotesById(buildRedemptionNoteDrafts(nextRewardRedemptions.items));
    setRaceEvents(nextRaceEvents.events);
  };

  const resetAdminDashboard = () => {
    setOverview(null);
    setUsers([]);
    setNotices([]);
    setMarketItems([]);
    setRewardRedemptions([]);
    setRedemptionNotesById({});
    setRaceEvents([]);
  };

  const loadDashboard = async (nextToken = adminToken) => {
    const trimmedToken = nextToken.trim();

    if (!trimmedToken) {
      setError('관리자 토큰을 입력해줘.');
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
      setError(loadError instanceof Error ? loadError.message : '관리자 정보를 불러오지 못했어.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (nextToken = adminTokenInput) => {
    const trimmedToken = nextToken.trim();

    if (!trimmedToken) {
      setError('관리자 토큰을 입력해줘.');
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
      setError(loginError instanceof Error ? loginError.message : '관리자 로그인에 실패했어.');
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

  const withSubmission = async (task: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : '관리자 작업 중 문제가 생겼어.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = (user: AdminUserSummary) => {
    if (!confirmAction(`${user.name} 회원을 삭제할까요? 이 작업은 되돌릴 수 없어요.`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminUser(adminToken, user.id);
      setUsers(result.users);
      await refreshOverview(adminToken);
      setMessage(`${user.name} 회원을 삭제했어요.`);
    });
  };

  const handleSubmitNotice = () => {
    void withSubmission(async () => {
      const payload = {
        title: noticeForm.title,
        message: noticeForm.message,
        priority: Number(noticeForm.priority),
        isActive: noticeForm.isActive,
      };

      const result = editingNoticeId
        ? await updateAdminNotice(adminToken, editingNoticeId, payload)
        : await createAdminNotice(adminToken, payload);

      setNotices(result.items);
      setEditingNoticeId(null);
      setNoticeForm(createEmptyNoticeForm());
      await refreshOverview(adminToken);
      setMessage(editingNoticeId ? '공지를 수정했어요.' : '공지를 추가했어요.');
    });
  };

  const handleDeleteNotice = (notice: AdminNotice) => {
    if (!confirmAction(`${notice.title} 공지를 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminNotice(adminToken, notice.id);
      setNotices(result.items);
      if (editingNoticeId === notice.id) {
        setEditingNoticeId(null);
        setNoticeForm(createEmptyNoticeForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${notice.title} 공지를 삭제했어요.`);
    });
  };

  const handleUpdateRedemption = (item: AdminRewardRedemption, status: AdminRewardRedemption['status']) => {
    void withSubmission(async () => {
      const result = await updateAdminRewardRedemption(adminToken, item.id, {
        status,
        adminNote: redemptionNotesById[item.id] ?? '',
      });

      setRewardRedemptions(result.items);
      setRedemptionNotesById(buildRedemptionNoteDrafts(result.items));
      await refreshOverview(adminToken);
      setMessage(`${item.userName}님의 교환 상태를 ${getRewardStatusLabel(status)}로 바꿨어요.`);
    });
  };

  const handleSubmitMarket = () => {
    void withSubmission(async () => {
      const payload = {
        title: marketForm.title,
        category: marketForm.category,
        description: marketForm.description,
        costPoints: Number(marketForm.costPoints),
        partnerName: marketForm.partnerName.trim() || undefined,
        repeatable: marketForm.repeatable,
        isActive: marketForm.isActive,
        inventoryCount: marketForm.inventoryCount.trim() ? Number(marketForm.inventoryCount) : null,
      };

      const result = editingMarketItemId
        ? await updateAdminMarketItem(adminToken, editingMarketItemId, payload)
        : await createAdminMarketItem(adminToken, payload);

      setMarketItems(result.items);
      setEditingMarketItemId(null);
      setMarketForm(createEmptyMarketForm());
      await refreshOverview(adminToken);
      setMessage(editingMarketItemId ? '마켓 상품을 수정했어요.' : '마켓 상품을 추가했어요.');
    });
  };

  const handleDeleteMarket = (item: AdminMarketItem) => {
    if (!confirmAction(`${item.title} 상품을 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminMarketItem(adminToken, item.id);
      setMarketItems(result.items);
      if (editingMarketItemId === item.id) {
        setEditingMarketItemId(null);
        setMarketForm(createEmptyMarketForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${item.title} 상품을 삭제했어요.`);
    });
  };

  const handleSubmitRace = () => {
    void withSubmission(async () => {
      const payload = {
        title: raceForm.title,
        subtitle: raceForm.subtitle,
        distanceKm: Number(raceForm.distanceKm),
        startsAt: raceForm.startsAt,
        registrationClosesAt: raceForm.registrationClosesAt,
        participationMode: raceForm.participationMode,
        proofMethod: raceForm.proofMethod,
        runWindowMinutes: Number(raceForm.runWindowMinutes),
        hostLabel: raceForm.hostLabel,
        capacity: Number(raceForm.capacity),
        entryFeePoints: Number(raceForm.entryFeePoints),
        operationNote: raceForm.operationNote,
      };

      const result = editingRaceEventId
        ? await updateAdminOfflineRaceEvent(adminToken, editingRaceEventId, payload)
        : await createAdminOfflineRaceEvent(adminToken, payload);

      setRaceEvents(result.events);
      setEditingRaceEventId(null);
      setRaceForm(createEmptyRaceForm());
      await refreshOverview(adminToken);
      setMessage(editingRaceEventId ? '레이스를 수정했어요.' : '새 레이스를 추가했어요.');
    });
  };

  const handleDeleteRace = (event: AdminOfflineRaceEvent) => {
    if (!confirmAction(`${event.title} 레이스를 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminOfflineRaceEvent(adminToken, event.id);
      setRaceEvents(result.events);
      if (editingRaceEventId === event.id) {
        setEditingRaceEventId(null);
        setRaceForm(createEmptyRaceForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${event.title} 레이스를 삭제했어요.`);
    });
  };

  const filteredNotices = useMemo(
    () => filterAdminNotices(notices, noticeQuery, noticeFilter),
    [noticeFilter, noticeQuery, notices],
  );
  const filteredUsers = useMemo(() => filterAdminUsers(users, userQuery), [userQuery, users]);
  const filteredMarketItems = useMemo(
    () => filterAdminMarketItems(marketItems, marketQuery, marketFilter),
    [marketFilter, marketItems, marketQuery],
  );
  const filteredRewardRedemptions = useMemo(
    () => filterAdminRewardRedemptions(rewardRedemptions, redemptionQuery, redemptionFilter),
    [redemptionFilter, redemptionQuery, rewardRedemptions],
  );
  const filteredRaceEvents = useMemo(
    () => filterAdminRaceEvents(raceEvents, raceQuery, raceFilter),
    [raceEvents, raceFilter, raceQuery],
  );
  const isAuthenticated = Boolean(adminSession);

  return {
    adminSession,
    adminTokenInput,
    apiBaseUrl: API_CONFIG.baseUrl,
    authReady,
    editingMarketItemId,
    editingNoticeId,
    editingRaceEventId,
    error,
    filteredMarketItems,
    filteredNotices,
    filteredRaceEvents,
    filteredRewardRedemptions,
    filteredUsers,
    handleAdminLogin,
    handleAdminLogout,
    handleDeleteMarket,
    handleDeleteNotice,
    handleDeleteRace,
    handleDeleteUser,
    handleSubmitMarket,
    handleSubmitNotice,
    handleSubmitRace,
    handleUpdateRedemption,
    isAuthenticated,
    loadDashboard,
    loading,
    marketFilter,
    marketForm,
    marketItems,
    marketQuery,
    message,
    noticeFilter,
    noticeForm,
    noticeQuery,
    notices,
    overview,
    raceEvents,
    raceFilter,
    raceForm,
    raceQuery,
    redemptionFilter,
    redemptionNotesById,
    redemptionQuery,
    rewardRedemptions,
    setAdminTokenInput,
    setEditingMarketItemId,
    setEditingNoticeId,
    setEditingRaceEventId,
    setMarketFilter,
    setMarketForm,
    setMarketQuery,
    setNoticeFilter,
    setNoticeForm,
    setNoticeQuery,
    setRaceFilter,
    setRaceForm,
    setRaceQuery,
    setRedemptionFilter,
    setRedemptionNotesById,
    setRedemptionQuery,
    setUserQuery,
    submitting,
    userQuery,
    users,
  };
}
