import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { RunMatchResult } from '@/domain';
import {
  fetchMatchResult,
  fetchRunningMatchStatus,
  isApiError,
  isMatchResultNotResolvedError,
} from '@/services';
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

// C-5 convoy relief — a fresh post-save arrival (origin==='running', set by
// runSaveNavigation) delays its FIRST reconcile: the client just pushed the final status
// itself and the server's §B4 fallback seal takes ~90s anyway, so an immediate /status
// re-query only piles onto the finish-window lock convoy. The jitter de-syncs the two
// finishing phones. Cold opens (내 활동 etc., no origin) keep the immediate reconcile.
const POST_SAVE_FIRST_RECONCILE_DELAY_MS = 8_000;
const POST_SAVE_FIRST_RECONCILE_JITTER_MS = 4_000;

export function parseMatchMode(value?: string): 'duel' | 'group' | null {
  return value === 'duel' || value === 'group' ? value : null;
}

type UseRunDetailMatchReconcileParams = {
  loadRunDetail: () => Promise<void> | void;
  matchDistanceKm?: string;
  matchId?: string;
  matchMode?: string;
  matchSlotStartAt?: string;
  origin?: string;
  // §3-⑦: when the still-pending record was made — used to decide whether a /result 404
  // is terminal (>24h: the session is long pruned AND no saved run backs a reconstruction).
  runRecordTimestamp: string | null;
  savedMatchResult: RunMatchResult | null;
  // 친구 기록이면 오버레이 전면 차단 (오너 2026-08-28 닉네임화의 적대검증 발견): /status와
  // /result의 my* 필드는 항상 "요청한 사용자"(뷰어) 기준이라, 친구의 미확정 기록 위에 이
  // 오버레이를 얹으면 친구 닉네임 행에 뷰어의 판정/페이스가 붙는 오표기가 된다. 친구 기록의
  // 유일한 owner 관점 소스는 저장 블롭뿐 — 서버가 §B4로 치유하면 포커스 재조회가 치유된
  // 블롭을 그대로 보여준다 (loadRunDetail 재시도는 그래서 유지).
  isFriendRecord?: boolean;
};

// C3 / group parity + §3-⑦ reconcile cluster, extracted from useRunDetail: for a duel OR
// group that was UNRESOLVED at save time, re-query the official record on focus (plus a
// one-shot retry past the §B4 fallback window) and reconcile so both phones' run-detail
// show the identical final verdict/placement. The gate derives from the SAVED matchResult
// itself (matchId + mode + compared distance) rather than route params, so re-opening a
// PENDING record from 내 활동 / 기록 / 친구 (which pass only { runId }) STILL reconciles.
// Never downgrades a good record. The pure logic lives in runDetailMatchReconcile.ts.
export function useRunDetailMatchReconcile({
  loadRunDetail,
  matchDistanceKm,
  matchId,
  matchMode,
  matchSlotStartAt,
  origin,
  runRecordTimestamp,
  savedMatchResult,
  isFriendRecord = false,
}: UseRunDetailMatchReconcileParams) {
  // C3: a reconciled duel matchResult rebuilt from the server's official record when the
  // saved one was unresolved at save time. Null means "use the as-saved record".
  const [reconciledMatchResult, setReconciledMatchResult] = useState<RunMatchResult | null>(null);
  // §3-⑦ terminal: the match can NEVER resolve anymore (410 match_gone, or a >24h-old
  // pending record answering 404). Overlay a neutral "결과 미확정으로 종료" record and stop
  // re-polling — 집계 중 must not stick forever. Overlay-only; the persisted blob is never
  // rewritten.
  const [terminalMatchResult, setTerminalMatchResult] = useState<RunMatchResult | null>(null);

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
  // isFriendRecord면 항상 false — 뷰어 관점 오버레이가 친구 기록을 오표기하는 것을 차단
  // (runResultFallback도 runReconcile에서만 불리므로 이 게이트 하나로 전부 막힌다).
  const shouldReconcileMatch = Boolean(savedReconcileContext && reconcileMatchId && reconcileMode)
    && !isFriendRecord;
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
  // and on focus we also re-fetch the (now-healed) run detail.
  // C-5: a fresh post-save arrival delays its FIRST reconcile by ~8s+jitter (see constants) so
  // two finishing phones stop piling reads onto the finish-window lock; cold opens reconcile
  // immediately as before.
  const isPostSaveArrival = origin === 'running';
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      let firstReconcileTimer: ReturnType<typeof setTimeout> | null = null;
      if (isPostSaveArrival) {
        firstReconcileTimer = setTimeout(() => {
          if (!signal.cancelled) {
            runReconcile(signal);
          }
        }, POST_SAVE_FIRST_RECONCILE_DELAY_MS + Math.floor(Math.random() * POST_SAVE_FIRST_RECONCILE_JITTER_MS));
      } else {
        runReconcile(signal);
      }
      const retryTimer = setTimeout(() => {
        if (!signal.cancelled) {
          loadRunDetail();
          runReconcile(signal);
        }
      }, MATCH_RECONCILE_RETRY_MS);
      return () => {
        signal.cancelled = true;
        if (firstReconcileTimer) {
          clearTimeout(firstReconcileTimer);
        }
        clearTimeout(retryTimer);
      };
    }, [isPostSaveArrival, loadRunDetail, runReconcile]),
  );

  return {
    reconciledMatchResult,
    terminalMatchResult,
  };
}
