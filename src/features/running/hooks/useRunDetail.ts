import { useEffect, useMemo, useState } from 'react';
import type { Href } from 'expo-router';
import type { RunDetailResponse, RunningMatchStatusResponse } from '@/lib/api/types';
import { fetchRunDetail, fetchRunningMatchStatus, getApiErrorMessage } from '@/services';
import {
  advanceMatchStatusVanishState,
  isMatchStatusVanishConfirmed,
  isMatchStatusVanishError,
  resetMatchStatusVanishState,
  type MatchStatusVanishState,
} from '@/features/runs/sync/matchStatusVanish';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
import {
  shouldTransitionRunDetailToMatchRecord,
  type RunDetailMatchTransitionReason,
} from '@/features/running/utils/runDetailMatchTransition';

type UseRunDetailParams = {
  friendId?: string;
  matchDistanceKm?: string;
  matchId?: string;
  matchMode?: string;
  matchSlotStartAt?: string;
  origin?: string;
  runId?: string;
};

const RUN_DETAIL_MATCH_STATUS_POLL_MS = 5000;
const RUN_DETAIL_MATCH_STATUS_STALE_MS = 30 * 60 * 1000;

function parseMatchMode(value?: string): 'duel' | 'group' | null {
  return value === 'duel' || value === 'group' ? value : null;
}

function parseDistanceKm(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const [matchRecordTransitionReason, setMatchRecordTransitionReason] =
    useState<RunDetailMatchTransitionReason | null>(null);

  useEffect(() => {
    fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '기록 상세 정보를 불러오지 못했어.')))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  useEffect(() => {
    const parsedMatchMode = parseMatchMode(matchMode);
    const parsedDistanceKm = parseDistanceKm(matchDistanceKm);
    if (!matchId || !parsedMatchMode || typeof parsedDistanceKm !== 'number' || !matchSlotStartAt) {
      setMatchRecordTransitionReason(null);
      return undefined;
    }

    const activeMatchId = matchId;
    const activeMatchMode = parsedMatchMode;
    const activeDistanceKm = parsedDistanceKm;
    const activeSlotStartAt = matchSlotStartAt;
    let canceled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let vanishState: MatchStatusVanishState = { count: 0, matchId: null };
    const startedAtMs = Date.now();

    function scheduleNextPoll() {
      if (canceled || Date.now() - startedAtMs > RUN_DETAIL_MATCH_STATUS_STALE_MS) {
        return;
      }

      timeoutId = setTimeout(() => {
        void pollMatchStatus();
      }, RUN_DETAIL_MATCH_STATUS_POLL_MS);
    }

    function handleStatus(status: RunningMatchStatusResponse | null, vanishedConfirmed: boolean) {
      const reason = shouldTransitionRunDetailToMatchRecord({
        matchId: activeMatchId,
        mode: activeMatchMode,
        status,
        vanishedConfirmed,
      });
      if (reason) {
        setMatchRecordTransitionReason(reason);
        canceled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        return true;
      }

      return false;
    }

    async function pollMatchStatus() {
      try {
        const payload = await fetchRunningMatchStatus({
          mode: activeMatchMode,
          distanceKm: activeDistanceKm,
          slotStartAt: activeSlotStartAt,
          matchId: activeMatchId,
        });
        vanishState = resetMatchStatusVanishState(vanishState, activeMatchId);
        if (!handleStatus(payload, false)) {
          scheduleNextPoll();
        }
      } catch (statusError) {
        if (isMatchStatusVanishError(statusError, activeMatchId)) {
          vanishState = advanceMatchStatusVanishState(vanishState, activeMatchId);
          if (!handleStatus(null, isMatchStatusVanishConfirmed(vanishState))) {
            scheduleNextPoll();
          }
          return;
        }

        scheduleNextPoll();
      }
    }

    void pollMatchStatus();

    return () => {
      canceled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [matchDistanceKm, matchId, matchMode, matchSlotStartAt]);

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
  const matchResult = runDetail?.run.matchResult ?? null;
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

  return {
    backHref,
    backLabel,
    error,
    latestCoordinate,
    loading,
    mapRegion,
    matchBonusLabel,
    matchRecordTransitionReason,
    matchResult,
    routeCoordinates,
    runDetail,
    sourceLabel,
  };
}
