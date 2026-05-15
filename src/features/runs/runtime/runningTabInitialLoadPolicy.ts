import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShells';

export type RunningTabInitialLoadPolicyInput = {
  focusMatchId?: string;
  focusMatchMode?: string;
  focusRoomId?: string;
  forceMatchArena?: boolean;
  mode: 'stack' | 'tab';
  roomInviteToken?: string;
  routeShellHint?: TrackRunShellKind;
};

export function shouldDeferRunningTabRuntimeInitialMount({
  focusMatchId,
  focusMatchMode,
  focusRoomId,
  forceMatchArena,
  mode,
  roomInviteToken,
  routeShellHint,
}: RunningTabInitialLoadPolicyInput) {
  return mode === 'tab'
    && routeShellHint === 'idle'
    && !focusMatchId
    && !focusMatchMode
    && !focusRoomId
    && !forceMatchArena
    && !roomInviteToken;
}
