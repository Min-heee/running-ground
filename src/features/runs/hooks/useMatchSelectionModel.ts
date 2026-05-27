import { useEffect, useMemo, useRef } from 'react';
import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import type { BlockingMatchReference } from '@/features/runs/components/matchSetupCards/types';
import type { RoomStartMode } from '@/features/runs/hooks/usePartyRunRoom';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { formatMatchTargetDistance } from '@/features/runs/utils/matchScheduling';
import {
  buildMatchParticipantStatusLabel,
  isBlockingMatchState,
  isLiveMatchState,
} from '@/features/runs/lifecycle/matchStateMachine';
import { buildMatchProgressModel } from '@/features/runs/viewModels/matchProgress';
import type {
  RequestDuelMatchResponse,
  RequestGroupMatchResponse,
  RunningMatchRoom,
  RunningMatchState,
  RunningMatchStatusResponse,
  UpcomingRunningMatchItem,
} from '@/lib/api/types';
import { rgDiagLog } from '@/utils/rgPerfTrace';

type SlotOption = {
  startsAt: string;
  label: string;
};

type MatchSelectionOption = MatchOptionItem & {
  summary: string;
  meta: string;
  startLabel: string;
  liveTitle: string;
  liveText: string;
};

function buildBlockingMatchReference(
  status: RunningMatchStatusResponse | null,
  upcomingMatch: UpcomingRunningMatchItem | null,
): BlockingMatchReference | null {
  const matchId = status?.matchId ?? upcomingMatch?.matchId ?? null;
  if (!matchId) {
    return null;
  }

  return {
    matchId,
    distanceKm: status?.distanceKm ?? upcomingMatch?.distanceKm ?? null,
    slotStartAt: status?.slotStartAt ?? upcomingMatch?.slotStartAt ?? null,
    testMode: Boolean(status?.isTestMatch ?? upcomingMatch?.isTestMatch),
  };
}

type UseMatchSelectionModelInput = {
  matchMode: RunMatchMode;
  duelDistanceKm: number;
  groupDistanceKm: number;
  roomMatchMode: 'duel' | 'group';
  roomStartMode: RoomStartMode;
  visibleMatchRoom: RunningMatchRoom | null;
  visibleUpcomingMatches: UpcomingRunningMatchItem[];
  duelMatchState: RunningMatchState;
  groupMatchState: RunningMatchState;
  duelMatchStatus: RunningMatchStatusResponse | null;
  groupMatchStatus: RunningMatchStatusResponse | null;
  duelMatchResult: RequestDuelMatchResponse | null;
  groupMatchResult: RequestGroupMatchResponse | null;
  selectedDuelSlot: SlotOption | null;
  selectedGroupSlot: SlotOption | null;
  duelMatchNotice: string | null;
  groupMatchNotice: string | null;
  effectiveGroupParticipantCount: number;
  effectiveGroupSeedRank?: number | null;
};

export function useMatchSelectionModel({
  matchMode,
  duelDistanceKm,
  groupDistanceKm,
  roomMatchMode,
  roomStartMode,
  visibleMatchRoom,
  visibleUpcomingMatches,
  duelMatchState,
  groupMatchState,
  duelMatchStatus,
  groupMatchStatus,
  duelMatchResult,
  groupMatchResult,
  selectedDuelSlot,
  selectedGroupSlot,
  duelMatchNotice,
  groupMatchNotice,
  effectiveGroupParticipantCount,
  effectiveGroupSeedRank,
}: UseMatchSelectionModelInput) {
  const lastDuelOpponentRenderedKeyRef = useRef<string | null>(null);
  const matchOptions = useMemo<MatchSelectionOption[]>(
    () => [
      {
        mode: 'solo',
        title: '혼자 러닝',
        summary: '기록에만 집중하는 기본 러닝 모드예요.',
        meta: '지금 페이스와 거리 흐름에만 집중',
        startLabel: '바로 런닝 시작',
        liveTitle: '개인 러닝 진행 중',
        liveText: '내 페이스와 현재 리듬을 지켜가는 데 집중하기 좋아요.',
      },
      {
        mode: 'duel',
        title: '1대1 매치',
        summary: '비슷한 목표 러너 한 명과 바로 붙는 대결 모드예요.',
        meta: `${formatMatchTargetDistance(duelDistanceKm)} 기준 · 1시간 단위 주간 예약`,
        startLabel: '1대1 매치로 시작',
        liveTitle: '1대1 매치 진행 중',
        liveText: '완주 시간과 평균 페이스를 중심으로 오늘 결과를 비교하기 좋은 모드예요.',
      },
      {
        mode: 'group',
        title: '그룹 대결',
        summary: '최대 30명까지 모아 순위 흐름을 보는 그룹전 모드예요.',
        meta: `${formatMatchTargetDistance(groupDistanceKm)} 기준 · 1시간 단위 주간 예약`,
        startLabel: '그룹 대결로 시작',
        liveTitle: '그룹 대결 진행 중',
        liveText: '비슷한 러너들과 함께 뛰면서 내 순위를 보는 재미를 주는 모드예요.',
      },
      {
        mode: 'room',
        title: '파티런',
        summary: '친구 초대나 링크 공유로 직접 대결 방을 열 수 있어요.',
        meta: `${roomMatchMode === 'duel' ? '1대1 대결' : '그룹 대결'} · ${roomStartMode === 'scheduled' ? '예약 시작' : '방장 시작'}`,
        startLabel: visibleMatchRoom ? '방 입장' : '방 만들기',
        liveTitle: '친구 방 대기 중',
        liveText: '친구를 모아 직접 대결을 열고 시작할 수 있어요.',
      },
    ],
    [duelDistanceKm, groupDistanceKm, roomMatchMode, roomStartMode, visibleMatchRoom],
  );

  const selectedMatch = matchOptions.find((option) => option.mode === matchMode) ?? matchOptions[0];
  const hasBlockingRoom = Boolean(visibleMatchRoom);
  const hasBlockingScheduledMatch = visibleUpcomingMatches.some((match) => isLiveMatchState(match.status));
  const hasBlockingDuelMatch = isBlockingMatchState(duelMatchState);
  const hasBlockingGroupMatch = isBlockingMatchState(groupMatchState);
  const blockingDuelUpcomingMatch = visibleUpcomingMatches.find((match) => match.mode === 'duel' && isLiveMatchState(match.status)) ?? null;
  const blockingGroupUpcomingMatch = visibleUpcomingMatches.find((match) => match.mode === 'group' && isLiveMatchState(match.status)) ?? null;
  const blockingRoomId = visibleMatchRoom?.roomId
    ?? visibleUpcomingMatches.find((match) => match.roomId)?.roomId
    ?? null;
  const blockingDuelMatch = buildBlockingMatchReference(duelMatchStatus, blockingDuelUpcomingMatch);
  const blockingGroupMatch = buildBlockingMatchReference(groupMatchStatus, blockingGroupUpcomingMatch);
  const canCreateDuelMatch = !hasBlockingRoom && !hasBlockingScheduledMatch && !hasBlockingGroupMatch && !hasBlockingDuelMatch;
  const canCreateGroupMatch = !hasBlockingRoom && !hasBlockingScheduledMatch && !hasBlockingDuelMatch && !hasBlockingGroupMatch;
  const blockingMatchHelperText = hasBlockingRoom
    ? '이미 참여 중이거나 초대된 방이 있어요. 먼저 그 방을 정리한 뒤 다른 매칭을 잡을 수 있어요.'
    : hasBlockingScheduledMatch
      ? '매칭은 한 번에 하나만 잡을 수 있어요. 지금 예약된 매치를 먼저 취소하거나 끝내야 해요.'
      : hasBlockingDuelMatch
        ? '이미 1대1 매칭 신청이나 예약이 있어요. 먼저 정리한 뒤 새 매칭을 잡을 수 있어요.'
        : hasBlockingGroupMatch
          ? '이미 그룹 매칭 신청이나 예약이 있어요. 먼저 정리한 뒤 새 매칭을 잡을 수 있어요.'
          : null;
  const duelReservationLocked = duelMatchState === 'matched' && duelMatchStatus?.canCancel === false;
  const groupReservationLocked = groupMatchState === 'matched' && groupMatchStatus?.canCancel === false;
  const effectiveDuelOpponent = duelMatchStatus?.opponent ?? duelMatchResult?.opponent ?? null;
  const effectiveDuelOpponentStatusLabel = effectiveDuelOpponent
    ? buildMatchParticipantStatusLabel(effectiveDuelOpponent.liveStatus)
    : null;
  useEffect(() => {
    if (matchMode !== 'duel') {
      return;
    }

    const progressModel = buildMatchProgressModel(effectiveDuelOpponent, duelDistanceKm);
    const detail = {
      effectiveDuelOpponentId: effectiveDuelOpponent?.id ?? null,
      hasProgress: progressModel.displayProgress.hasProgress,
      opponentLiveDistanceKm: effectiveDuelOpponent?.liveDistanceKm ?? null,
    };
    const key = JSON.stringify(detail);
    if (lastDuelOpponentRenderedKeyRef.current === key) {
      return;
    }

    lastDuelOpponentRenderedKeyRef.current = key;
    rgDiagLog('duel opponent rendered', detail);
  }, [duelDistanceKm, effectiveDuelOpponent, matchMode]);

  const effectiveDuelSlotLabel = duelMatchStatus?.slotLabel ?? duelMatchResult?.slotLabel ?? selectedDuelSlot?.label ?? '시간 미정';
  const effectiveGroupSlotLabel = groupMatchStatus?.slotLabel ?? groupMatchResult?.slotLabel ?? selectedGroupSlot?.label ?? '시간 미정';
  const duelNeedsManualRematch = Boolean(duelMatchNotice && duelMatchState === 'idle');
  const groupNeedsManualRematch = Boolean(groupMatchNotice && groupMatchState === 'idle');
  const liveMatchTitle = matchMode === 'duel' && effectiveDuelOpponent
    ? `${effectiveDuelOpponent.name}님과 1대1 매치 진행 중`
    : matchMode === 'group' && effectiveGroupParticipantCount
      ? `${effectiveGroupParticipantCount}명 그룹 대결 진행 중`
      : selectedMatch.liveTitle;
  const liveMatchText = matchMode === 'duel' && effectiveDuelOpponent
    ? `${effectiveDuelOpponent.compatibilitySummary} · ${effectiveDuelSlotLabel}`
    : matchMode === 'group' && effectiveGroupParticipantCount
      ? `${effectiveGroupSlotLabel} · 내 시작 시드 ${effectiveGroupSeedRank ?? 1}위`
      : selectedMatch.liveText;
  const readyActionLabel = matchMode === 'duel'
    ? duelMatchState === 'active'
      ? `${effectiveDuelOpponent?.name ?? '상대'}님과 매치 시작`
      : duelMatchState === 'matched'
        ? null
        : duelMatchState === 'waiting'
          ? '비슷한 상대를 계속 찾는 중'
          : '매칭 완료 후 시작'
    : matchMode === 'group'
      ? groupMatchState === 'active'
        ? `${effectiveGroupParticipantCount}명 그룹으로 시작`
        : groupMatchState === 'matched'
          ? null
          : groupMatchState === 'waiting'
            ? '비슷한 그룹을 계속 찾는 중'
            : '그룹 매칭 완료 후 시작'
      : visibleMatchRoom
        ? null
        : selectedMatch.startLabel;

  return {
    matchOptions,
    selectedMatch,
    canCreateDuelMatch,
    canCreateGroupMatch,
    blockingMatchHelperText,
    blockingRoomId,
    blockingDuelMatch,
    blockingGroupMatch,
    duelReservationLocked,
    groupReservationLocked,
    effectiveDuelOpponent,
    effectiveDuelOpponentStatusLabel,
    effectiveDuelSlotLabel,
    effectiveGroupSlotLabel,
    duelNeedsManualRematch,
    groupNeedsManualRematch,
    liveMatchTitle,
    liveMatchText,
    readyActionLabel,
  };
}
