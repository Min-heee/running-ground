import { useMemo } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import { formatMatchExpiryCountdown } from '@/features/runs/utils/matchScheduling';

type UseMatchLobbyRuntimeModelInput = {
  duelMatchStatus: RunningMatchStatusResponse | null;
  isDuelTestFlow: boolean;
  groupMatchStatus: RunningMatchStatusResponse | null;
};

export function useMatchLobbyRuntimeModel({
  duelMatchStatus,
  isDuelTestFlow,
  groupMatchStatus,
}: UseMatchLobbyRuntimeModelInput) {
  return useMemo(() => {
    const duelCompatibleCount = duelMatchStatus?.competitiveParticipantsCount ?? 0;
    const duelWaitingHasOtherApplicants = (duelMatchStatus?.participantCount ?? 0) > 1;
    const duelWaitingTitle = isDuelTestFlow
      ? duelWaitingHasOtherApplicants
        ? duelCompatibleCount >= 2
          ? '테스트 상대를 정리하는 중이에요'
          : '테스트 신청은 들어왔지만 아직 세션을 만드는 중이에요'
        : '테스트 상대를 기다리는 중이에요'
      : duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? '지금 바로 붙을 상대를 정리하는 중이에요'
        : '신청은 들어왔지만 아직 바로 붙이진 않았어요'
      : '비슷한 상대를 찾는 중이에요';
    const duelWaitingMeta = isDuelTestFlow
      ? duelWaitingHasOtherApplicants
        ? duelCompatibleCount >= 2
          ? `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 바로 붙을 수 있는 테스트 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
          : `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 지금 바로 붙을 수 있는 테스트 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
        : '다른 러너가 테스트 매칭을 누르면 바로 30초 카운트다운이 시작돼요.'
      : duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
        : `실제 신청 ${duelMatchStatus?.participantCount ?? 0}/${duelMatchStatus?.capacity ?? 2}명 · 지금 바로 붙을 수 있는 상대 ${duelCompatibleCount}/${duelMatchStatus?.capacity ?? 2}명`
      : '같은 거리와 시간대에서 먼저 찾기한 러너들 중 페이스와 레벨이 잘 맞는 상대를 찾고 있어요.';
    const duelWaitingHint = isDuelTestFlow
      ? duelWaitingHasOtherApplicants
        ? duelCompatibleCount >= 2
          ? '테스트 상대 세션이 정리되면 바로 30초 카운트다운이 시작돼요.'
          : '테스트 상대 세션을 만들고 있어요. 잠시만 기다리면 자동으로 30초 카운트다운이 시작돼요.'
        : '지금은 테스트 대기열에 들어간 상태예요. 다른 러너가 들어오면 자동으로 30초 카운트다운이 시작돼요.'
      : duelWaitingHasOtherApplicants
      ? duelCompatibleCount >= 2
        ? '잘 맞는 상대가 먼저 잡히면 바로 예약된 1대1로 바뀌어요.'
        : '페이스와 레벨이 실제로 잘 맞는 상대가 잡히면 자동으로 매치가 확정돼요.'
      : '지금은 먼저 대기열에 들어간 상태예요. 잘 맞는 상대가 잡히면 자동으로 매치가 확정돼요.';

    return {
      duelExpiryCountdownLabel: formatMatchExpiryCountdown(duelMatchStatus?.expiresInSeconds),
      groupExpiryCountdownLabel: formatMatchExpiryCountdown(groupMatchStatus?.expiresInSeconds),
      duelWaitingHint,
      duelWaitingMeta,
      duelWaitingTitle,
    };
  }, [
    duelMatchStatus?.capacity,
    duelMatchStatus?.competitiveParticipantsCount,
    duelMatchStatus?.expiresInSeconds,
    duelMatchStatus?.participantCount,
    groupMatchStatus?.expiresInSeconds,
    isDuelTestFlow,
  ]);
}
