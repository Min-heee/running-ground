import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import type { RunDetailResponse } from '@/lib/api/types';
import { fetchRunDetail, getApiErrorMessage } from '@/services';
import { getRunSourceLabel } from '@/features/runs/utils/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
import {
  parseMatchMode,
  useRunDetailMatchReconcile,
} from '@/features/running/hooks/useRunDetailMatchReconcile';
import { isMatchBonusPending } from '@/features/running/viewModels/matchBonusPending';

type UseRunDetailParams = {
  friendId?: string;
  matchDistanceKm?: string;
  matchId?: string;
  matchMode?: string;
  matchSlotStartAt?: string;
  origin?: string;
  runId?: string;
};

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

  // Re-fetchable run detail. After the server back-fills a PENDING one-finisher record (the
  // GET /result mutateStore seal + sweep), re-fetching surfaces the HEALED matchResult blob
  // directly — so re-opening the record, or simply re-focusing it after the §B4 window, shows
  // the resolved verdict without depending on the status-endpoint reconcile.
  const loadRunDetail = useCallback(() => {
    return fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '기록 상세 정보를 불러오지 못했어요.')))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  // C-5 — manual retry for the error state: clears the stale error and re-enters the
  // skeleton-loading state before re-fetching (loadRunDetail alone would keep both).
  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    return loadRunDetail();
  }, [loadRunDetail]);

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

  const savedMatchResult = runDetail?.run.matchResult ?? null;
  // §3-⑦: how old the still-pending record is — used to decide whether a /result 404 is
  // terminal (>24h: the session is long pruned AND no saved run backs a reconstruction).
  const runRecordTimestamp = runDetail?.run.endedAt ?? runDetail?.run.startedAt ?? runDetail?.run.date ?? null;
  // C3 / group parity + §3-⑦: the focus-driven reconcile of an unresolved-at-save match
  // record lives in its own hook; it overlays but never rewrites the persisted blob.
  const { reconciledMatchResult, terminalMatchResult } = useRunDetailMatchReconcile({
    loadRunDetail,
    matchDistanceKm,
    matchId,
    matchMode,
    matchSlotStartAt,
    origin,
    runRecordTimestamp,
    savedMatchResult,
    // 친구 기록에는 뷰어 관점(/status·/result의 my*) 오버레이를 절대 얹지 않는다 — 친구
    // 닉네임 행에 뷰어의 판정/기록이 붙는 오표기 방지 (2026-08-28 적대검증 발견).
    isFriendRecord: Boolean(friendId),
  });

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
  // 판정 미확정 창(그룹에선 꼴찌가 아닌 완주자 전원이 봄)에는 "+0P" 대신 '집계 중' 표기.
  // 기준은 반드시 SAVED 블롭이다(오버레이 아님): pointBreakdown.matchBonusPoints가 서버에서
  // 저장 블롭으로부터 파생되므로, 오버레이(reconcile) 기준으로 걸면 판정 오버레이가 먼저
  // 도착한 순간 '집계 중'이 "+0P"로 강등되는 창이 생긴다(적대 검증 2026-08-11). 블롭 기준이면
  // 라벨과 숫자가 같은 fetch 스냅샷에서 나와 항상 원자적으로 일치한다 — 블롭이 치유된 재조회
  // 한 번에 '집계 중' → "+15P"로 함께 바뀐다.
  const matchBonusPending = isMatchBonusPending(savedMatchResult, Boolean(terminalMatchResult));
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
    matchBonusPending,
    matchResult,
    reload,
    routeCoordinates,
    runDetail,
    showMatchResultExit,
    sourceLabel,
  };
}
