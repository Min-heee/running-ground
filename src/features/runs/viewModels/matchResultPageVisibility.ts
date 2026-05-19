import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import {
  isCurrentUserFinished,
  shouldShowResultPage,
  type MatchResultDisplayMode,
} from '@/features/runs/viewModels/matchResultProgressive';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

type MatchResultPageVisibilityInput = {
  matchMode: RunMatchMode;
  duelArenaParticipants: ArenaParticipantViewModel[];
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  groupArenaParticipants: ArenaParticipantViewModel[];
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
};

type ShouldShowMatchResultPageInput = {
  matchMode: RunMatchMode;
  currentUserFinished: boolean;
  hasTrackedMatchResult: boolean;
};

function resolveMatchResultDisplayMode(matchMode: RunMatchMode): MatchResultDisplayMode | null {
  return matchMode === 'duel' || matchMode === 'group' ? matchMode : null;
}

export function resolveCurrentUserFinishedForResultPage({
  matchMode,
  duelArenaParticipants,
  roomLinkedDuelPlaceholderParticipants,
  groupArenaParticipants,
  roomLinkedGroupPlaceholderParticipants,
}: MatchResultPageVisibilityInput): boolean {
  if (matchMode === 'duel') {
    return isCurrentUserFinished([
      ...duelArenaParticipants,
      ...roomLinkedDuelPlaceholderParticipants,
    ]);
  }

  if (matchMode === 'group') {
    return isCurrentUserFinished([
      ...groupArenaParticipants,
      ...roomLinkedGroupPlaceholderParticipants,
    ]);
  }

  return false;
}

export function shouldShowMatchResultPageOnCurrentUserFinished({
  matchMode,
  currentUserFinished,
  hasTrackedMatchResult,
}: ShouldShowMatchResultPageInput): boolean {
  const resultMode = resolveMatchResultDisplayMode(matchMode);

  if (!resultMode) {
    return false;
  }

  return shouldShowResultPage(currentUserFinished, resultMode)
    && (hasTrackedMatchResult || currentUserFinished);
}
