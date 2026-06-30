import { Platform } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';
import { resolveMatchRoomSnapshotPollingDecision } from './roomSnapshotPollingDecision';

// Android was 4000ms poll + 2500ms debounce → a party GUEST's lobby took ~4-6.5s to observe the
// host's 시작 (linkedMatchId), longer than the host's arming buffer, so the guest lingered in the
// 대기실 while the host already armed/measured (party start is pure /rooms/my polling — no realtime
// push). Halve it to ~2s observe latency (well inside the ~8s buffer) — kept MODERATE, not 1.5s, to
// avoid over-polling the Android JS thread. (Debounce must stay below the poll interval or it caps
// the effective cadence.)
const INVITE_INBOX_ANDROID_FOCUSED_POLL_MS = 2_000;
const INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS = 1_500;
const INVITE_INBOX_ANDROID_DEBOUNCE_MS = 1_500;
const INVITE_INBOX_DEFAULT_DEBOUNCE_MS = 800;

export const ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS = 4_000;

export function getFocusedInviteInboxPollMs() {
  return Platform.OS === 'android'
    ? INVITE_INBOX_ANDROID_FOCUSED_POLL_MS
    : INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS;
}

export function getInviteInboxDebounceMs() {
  return Platform.OS === 'android'
    ? INVITE_INBOX_ANDROID_DEBOUNCE_MS
    : INVITE_INBOX_DEFAULT_DEBOUNCE_MS;
}

export function resolveMatchRoomSnapshotPollingPolicy({
  linkedMatchId,
  state,
  linkedMatchStatus,
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
  linkedMatchStatus?: RunningMatchRoom['linkedMatchStatus'] | null;
}) {
  return resolveMatchRoomSnapshotPollingDecision({
    linkedMatchId,
    state,
    linkedMatchStatus,
    waitingRoomPollMs: getFocusedInviteInboxPollMs(),
  });
}
