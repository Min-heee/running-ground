import { isLiveMatchState } from '@/features/runs/lifecycle/matchStateMachine';
import type { StartTrackingActionInput, StartTrackingOptions } from './types';

export function getTrackingStartKey(
  matchMode: StartTrackingActionInput['matchMode'],
  options?: StartTrackingOptions,
) {
  return options?.matchId ?? (matchMode === 'solo' ? 'solo' : `${matchMode}:manual`);
}

export function resolveStartBlockedMessage({
  allowCountdownWarmup,
  duelMatchState,
  duelMatchStatus,
  groupMatchState,
  groupMatchStatus,
  matchMode,
  roomLinkedStartContext,
}: {
  allowCountdownWarmup: boolean;
  duelMatchState: StartTrackingActionInput['duelMatchState'];
  duelMatchStatus: StartTrackingActionInput['duelMatchStatus'];
  groupMatchState: StartTrackingActionInput['groupMatchState'];
  groupMatchStatus: StartTrackingActionInput['groupMatchStatus'];
  matchMode: StartTrackingActionInput['matchMode'];
  roomLinkedStartContext: StartTrackingActionInput['roomLinkedMatchContext'];
}) {
  if (matchMode === 'duel' && !isLiveMatchState(duelMatchState) && roomLinkedStartContext?.mode !== 'duel') {
    return '1대1 매칭이 잡힌 뒤에만 시작할 수 있어요.';
  }

  if (matchMode === 'group' && !isLiveMatchState(groupMatchState) && roomLinkedStartContext?.mode !== 'group') {
    return '그룹 매칭이 잡힌 뒤에만 시작할 수 있어요.';
  }

  if (
    matchMode === 'duel'
    && duelMatchState === 'matched'
    && !duelMatchStatus?.readyToStart
    && roomLinkedStartContext?.state !== 'active'
    && !allowCountdownWarmup
  ) {
    return '예약된 시작 시간이 되면 1대1 대결을 시작할 수 있어요.';
  }

  if (
    matchMode === 'group'
    && groupMatchState === 'matched'
    && !groupMatchStatus?.readyToStart
    && roomLinkedStartContext?.state !== 'active'
    && !allowCountdownWarmup
  ) {
    return '예약된 시작 시간이 되면 그룹 대결을 시작할 수 있어요.';
  }

  return null;
}
