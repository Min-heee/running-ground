import type { MatchLifecycleStage } from '@/features/runs/lifecycle/matchLifecycleController';

export type PreservedLiveMatchShell = {
  key: string;
  matchId: string;
  mode: 'duel' | 'group';
};

export function buildLiveMatchShellKey(matchId: string) {
  return `live-match:${matchId}`;
}

export function shouldPreserveLiveMatchShell({
  currentMatchId,
  currentMode,
  isCurrentUserForfeited,
  previous,
  requestedShowLiveArena,
  stage,
}: {
  currentMatchId: string | null;
  currentMode: 'duel' | 'group' | null;
  isCurrentUserForfeited: boolean;
  previous: PreservedLiveMatchShell | null;
  requestedShowLiveArena: boolean;
  stage: MatchLifecycleStage | null;
}) {
  if (!previous || isCurrentUserForfeited) {
    return false;
  }

  if (currentMatchId && currentMatchId !== previous.matchId) {
    return false;
  }

  if (currentMode && currentMode !== previous.mode) {
    return false;
  }

  if (requestedShowLiveArena) {
    return true;
  }

  return stage === 'arming' || stage === 'countdown' || stage === 'active';
}

export function resolveLiveMatchShellPreservation({
  currentMatchId,
  currentMode,
  isCurrentUserForfeited,
  previous,
  requestedShowLiveArena,
  stage,
}: {
  currentMatchId: string | null;
  currentMode: 'duel' | 'group' | null;
  isCurrentUserForfeited: boolean;
  previous: PreservedLiveMatchShell | null;
  requestedShowLiveArena: boolean;
  stage: MatchLifecycleStage | null;
}) {
  if (currentMatchId && currentMode && requestedShowLiveArena && !isCurrentUserForfeited) {
    const next = {
      key: buildLiveMatchShellKey(currentMatchId),
      matchId: currentMatchId,
      mode: currentMode,
    };

    return {
      key: next.key,
      next,
      preserved: false,
      shouldRenderLiveArena: true,
    };
  }

  const preserved = shouldPreserveLiveMatchShell({
    currentMatchId,
    currentMode,
    isCurrentUserForfeited,
    previous,
    requestedShowLiveArena,
    stage,
  });

  return {
    key: preserved ? previous?.key ?? null : currentMatchId ? buildLiveMatchShellKey(currentMatchId) : null,
    next: preserved ? previous : null,
    preserved,
    shouldRenderLiveArena: preserved || requestedShowLiveArena,
  };
}

