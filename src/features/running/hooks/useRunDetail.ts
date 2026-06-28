import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import type { RunMatchResult } from '@/domain';
import type { RunDetailResponse } from '@/lib/api/types';
import { fetchRunDetail, fetchRunningMatchStatus, getApiErrorMessage } from '@/services';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
import {
  deriveSavedMatchReconcileContext,
  MATCH_RECONCILE_RETRY_MS,
  reconcileDuelRunDetailMatchResult,
  reconcileGroupRunDetailMatchResult,
} from '@/features/running/utils/runDetailMatchReconcile';

type UseRunDetailParams = {
  friendId?: string;
  matchDistanceKm?: string;
  matchId?: string;
  matchMode?: string;
  matchSlotStartAt?: string;
  origin?: string;
  runId?: string;
};

function parseMatchMode(value?: string): 'duel' | 'group' | null {
  return value === 'duel' || value === 'group' ? value : null;
}

export function useRunDetail({
  friendId,
  matchDistanceKm,
  matchId,
  matchMode,
  matchSlotStartAt,
  origin,
  runId,
}: UseRunDetailParams) {
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // C3: a reconciled duel matchResult rebuilt from the server's official record when the
  // saved one was unresolved at save time. Null means "use the as-saved record".
  const [reconciledMatchResult, setReconciledMatchResult] = useState<RunMatchResult | null>(null);

  // Re-fetchable run detail. After the server back-fills a PENDING one-finisher record (the
  // GET /result mutateStore seal + sweep), re-fetching surfaces the HEALED matchResult blob
  // directly — so re-opening the record, or simply re-focusing it after the §B4 window, shows
  // the resolved verdict without depending on the status-endpoint reconcile.
  const loadRunDetail = useCallback(() => {
    return fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '기록 상세 정보를 불러오지 못했어.')))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  useEffect(() => {
    loadRunDetail();
  }, [loadRunDetail]);

  // Re-fetch on every focus so a record that was PENDING at save heals as soon as the user
  // re-opens it (by then the server has back-filled the saved run via /result or the sweep).
  useFocusEffect(
    useCallback(() => {
      loadRunDetail();
    }, [loadRunDetail]),
  );

  // C3 / group parity: for a duel OR group that was UNRESOLVED at save time, re-query the
  // official record and reconcile so both phones' run-detail show the identical final
  // verdict/placement. The gate now derives from the SAVED matchResult itself (matchId + mode +
  // compared distance) rather than route params, so re-opening a PENDING record from 내 활동 /
  // 기록 / 친구 (which pass only { runId }) STILL reconciles. Never downgrades a good record.
  const savedMatchResult = runDetail?.run.matchResult ?? null;
  const savedReconcileContext = deriveSavedMatchReconcileContext(savedMatchResult);
  // Route params (post-save navigation) supply the exact slotStartAt; otherwise the backend
  // treats slotStartAt leniently when a matchId is present, so a sentinel works.
  const routeMatchMode = parseMatchMode(matchMode);
  const routeDistanceKm = matchDistanceKm ? Number(matchDistanceKm) : NaN;
  const reconcileMode = savedReconcileContext?.mode ?? routeMatchMode ?? null;
  const reconcileMatchId = savedReconcileContext?.matchId ?? (matchId ? matchId.trim() : '') ?? '';
  const reconcileDistanceKm = savedReconcileContext && savedReconcileContext.distanceKm > 0
    ? savedReconcileContext.distanceKm
    : Number.isFinite(routeDistanceKm) ? routeDistanceKm : 0;
  const reconcileSlotStartAt = matchSlotStartAt ?? '';
  const shouldReconcileMatch = Boolean(savedReconcileContext && reconcileMatchId && reconcileMode);

  // A single reconcile pass: re-query the official status, reconcile the saved record, and
  // surface the upgrade. Best-effort — a failure falls back to the as-saved record.
  const runReconcile = useCallback(
    (signal: { cancelled: boolean }) => {
      if (!shouldReconcileMatch || !reconcileMode || !reconcileMatchId) {
        return;
      }
      fetchRunningMatchStatus({
        mode: reconcileMode,
        distanceKm: reconcileDistanceKm,
        slotStartAt: reconcileSlotStartAt,
        matchId: reconcileMatchId,
      })
        .then((status) => {
          if (signal.cancelled) {
            return;
          }
          const reconciled = reconcileMode === 'group'
            ? reconcileGroupRunDetailMatchResult({ matchResult: savedMatchResult, status })
            : reconcileDuelRunDetailMatchResult({ matchResult: savedMatchResult, status });
          if (reconciled) {
            setReconciledMatchResult(reconciled);
          }
        })
        .catch(() => {
          // Best-effort: fall back to the as-saved record rather than erroring the screen.
        });
    },
    [reconcileDistanceKm, reconcileMatchId, reconcileMode, reconcileSlotStartAt, savedMatchResult, shouldReconcileMatch],
  );

  // Reconcile on focus AND schedule a one-shot retry PAST the §B4 fallback window. The original
  // single reconcile fired once ~1-2s post-finish — far inside the 90s window — so it always
  // returned pending and never retried. The retry lands after the server has sealed/back-filled,
  // and on focus we also re-fetch the (now-healed) run detail above.
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      runReconcile(signal);
      const retryTimer = setTimeout(() => {
        if (!signal.cancelled) {
          loadRunDetail();
          runReconcile(signal);
        }
      }, MATCH_RECONCILE_RETRY_MS);
      return () => {
        signal.cancelled = true;
        clearTimeout(retryTimer);
      };
    }, [loadRunDetail, runReconcile]),
  );

  const backHref: Href = friendId
    ? { pathname: '/friend-detail', params: { friendId } }
    : origin === 'running'
      ? '/(tabs)/running'
      : '/my-activity';
  const backLabel = friendId
    ? '친구 활동으로 돌아가기'
    : origin === 'running'
      ? '런닝으로 돌아가기'
      : '내 활동으로 돌아가기';
  const sourceLabel = runDetail ? getRunSourceLabel(runDetail.run) : '';
  // C3: surface the server-reconciled verdict when we have one; otherwise the as-saved record.
  const matchResult = reconciledMatchResult ?? savedMatchResult;
  const matchBonusLabel = matchResult
    ? matchResult.mode === 'duel'
      ? '1대1 대결 포인트'
      : '그룹 대결 포인트'
    : '매치 보너스';
  const routeCoordinates = useMemo(() => (
    runDetail?.run.route?.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })) ?? []
  ), [runDetail?.run.route]);
  const latestCoordinate = routeCoordinates.length ? routeCoordinates[routeCoordinates.length - 1] : null;
  const mapRegion = useMemo(
    () => (runDetail?.run.route ? getRunMapRegion(runDetail.run.route) : null),
    [runDetail?.run.route],
  );
  const showMatchResultExit = Boolean(matchId && parseMatchMode(matchMode));

  return {
    backHref,
    backLabel,
    error,
    latestCoordinate,
    loading,
    mapRegion,
    matchBonusLabel,
    matchResult,
    routeCoordinates,
    runDetail,
    showMatchResultExit,
    sourceLabel,
  };
}
