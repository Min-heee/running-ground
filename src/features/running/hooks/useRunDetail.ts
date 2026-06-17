import { useEffect, useMemo, useState } from 'react';
import type { Href } from 'expo-router';
import type { RunMatchResult } from '@/domain';
import type { RunDetailResponse } from '@/lib/api/types';
import { fetchRunDetail, fetchRunningMatchStatus, getApiErrorMessage } from '@/services';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
import {
  isUnresolvedDuelMatchResult,
  reconcileDuelRunDetailMatchResult,
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

  useEffect(() => {
    fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '기록 상세 정보를 불러오지 못했어.')))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  // C3: for a duel that was UNRESOLVED at save time, re-query the official duel record and
  // reconcile so both phones' run-detail show identical times + verdict. Only runs for a
  // 1대1 record that still looks placeholder; never downgrades a good saved record.
  const savedMatchResult = runDetail?.run.matchResult ?? null;
  const parsedMatchMode = parseMatchMode(matchMode);
  const distanceKmNumber = matchDistanceKm ? Number(matchDistanceKm) : NaN;
  const shouldReconcileDuel = Boolean(
    matchId
    && parsedMatchMode === 'duel'
    && matchSlotStartAt
    && Number.isFinite(distanceKmNumber)
    && isUnresolvedDuelMatchResult(savedMatchResult),
  );

  useEffect(() => {
    if (!shouldReconcileDuel || !matchId || !matchSlotStartAt) {
      return;
    }

    let cancelled = false;
    fetchRunningMatchStatus({
      mode: 'duel',
      distanceKm: distanceKmNumber,
      slotStartAt: matchSlotStartAt,
      matchId,
    })
      .then((status) => {
        if (cancelled) {
          return;
        }
        const reconciled = reconcileDuelRunDetailMatchResult({
          matchResult: savedMatchResult,
          status,
        });
        if (reconciled) {
          setReconciledMatchResult(reconciled);
        }
      })
      .catch(() => {
        // Reconciliation is best-effort: if the official record is unavailable, fall back to
        // the as-saved record rather than blocking or erroring the run-detail screen.
      });

    return () => {
      cancelled = true;
    };
  }, [distanceKmNumber, matchId, matchSlotStartAt, savedMatchResult, shouldReconcileDuel]);

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
