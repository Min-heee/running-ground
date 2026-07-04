import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import type { RunMatchResult } from '@/domain';
import type { RunDetailResponse } from '@/lib/api/types';
import {
  fetchMatchResult,
  fetchRunDetail,
  fetchRunningMatchStatus,
  getApiErrorMessage,
  isApiError,
  isMatchResultNotResolvedError,
} from '@/services';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
import {
  buildUnresolvedTerminalMatchResult,
  deriveSavedMatchReconcileContext,
  MATCH_RECONCILE_RETRY_MS,
  reconcileDuelRunDetailMatchResult,
  reconcileDuelRunDetailMatchResultFromResult,
  reconcileGroupRunDetailMatchResult,
  reconcileGroupRunDetailMatchResultFromResult,
  shouldTerminalizeUnresolvedMatchResult,
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
  // §3-⑦ terminal: the match can NEVER resolve anymore (410 match_gone, or a >24h-old
  // pending record answering 404). Overlay a neutral "결과 미확정으로 종료" record and stop
  // re-polling — 집계 중 must not stick forever. Overlay-only; the persisted blob is never
  // rewritten.
  const [terminalMatchResult, setTerminalMatchResult] = useState<RunMatchResult | null>(null);

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

  // §3-⑦: how old the still-pending record is — used to decide whether a /result 404 is
  // terminal (>24h: the session is long pruned AND no saved run backs a reconstruction).
  const runRecordTimestamp = runDetail?.run.endedAt ?? runDetail?.run.startedAt ?? runDetail?.run.date ?? null;
  const isReconcileTerminal = terminalMatchResult !== null;

  // §3-⑦ /result fallback: when the /status reconcile yields no resolved verdict (or /status
  // itself fails — post-prune it answers idle-shaped and the response guard rejects it), the
  // saved blob is still pending, so re-query the by-matchId /result endpoint and derive my
  // tone/placement from the participant rows. Overlay only (setReconciledMatchResult) —
  // never fabricate a persisted verdict.
  const runResultFallback = useCallback(
    (signal: { cancelled: boolean }) => {
      if (!reconcileMatchId || !reconcileMode) {
        return;
      }
      fetchMatchResult(reconcileMatchId)
        .then((result) => {
          if (signal.cancelled) {
            return;
          }
          const reconciled = reconcileMode === 'group'
            ? reconcileGroupRunDetailMatchResultFromResult({ matchResult: savedMatchResult, result })
            : reconcileDuelRunDetailMatchResultFromResult({ matchResult: savedMatchResult, result });
          if (reconciled) {
            setReconciledMatchResult(reconciled);
          }
        })
        .catch((resultError: unknown) => {
          if (signal.cancelled) {
            return;
          }
          // Anything but the friendly not-resolved signal (network, 5xx, …) → stay pending;
          // the next focus retries. Never terminalize off an ambiguous failure.
          if (!isMatchResultNotResolvedError(resultError)) {
            return;
          }
          const cause = resultError.cause;
          const notFound = isApiError(cause) && cause.status === 404;
          const recordAtMs = runRecordTimestamp ? Date.parse(runRecordTimestamp) : NaN;
          const pendingAgeMs = Number.isFinite(recordAtMs) ? Date.now() - recordAtMs : null;
          if (
            savedMatchResult
            && shouldTerminalizeUnresolvedMatchResult({
              matchGone: resultError.matchGone,
              notFound,
              pendingAgeMs,
            })
          ) {
            setTerminalMatchResult(buildUnresolvedTerminalMatchResult(savedMatchResult));
            return;
          }
          // MatchResultNotResolvedError without a terminal signal → stay pending.
        });
    },
    [reconcileMatchId, reconcileMode, runRecordTimestamp, savedMatchResult],
  );

  // A single reconcile pass: re-query the official status, reconcile the saved record, and
  // surface the upgrade. Best-effort — a failure falls back to the as-saved record. Once a
  // terminal state is reached, never re-poll (§3-⑦).
  const runReconcile = useCallback(
    (signal: { cancelled: boolean }) => {
      if (!shouldReconcileMatch || !reconcileMode || !reconcileMatchId || isReconcileTerminal) {
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
            return;
          }
          // No resolved verdict from /status while the blob is pending → /result fallback.
          runResultFallback(signal);
        })
        .catch(() => {
          // /status failed (idle-shaped post-prune response rejected by the guard, network, …)
          // → the /result fallback still works, incl. against the current prod backend.
          runResultFallback(signal);
        });
    },
    [
      isReconcileTerminal,
      reconcileDistanceKm,
      reconcileMatchId,
      reconcileMode,
      reconcileSlotStartAt,
      runResultFallback,
      savedMatchResult,
      shouldReconcileMatch,
    ],
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
  // C3: surface the server-reconciled verdict when we have one; else the terminal neutral
  // overlay (§3-⑦, "결과 미확정으로 종료"); otherwise the as-saved record.
  const matchResult = reconciledMatchResult ?? terminalMatchResult ?? savedMatchResult;
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
