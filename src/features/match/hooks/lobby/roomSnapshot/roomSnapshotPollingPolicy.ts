import { Platform } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';

const INVITE_INBOX_ANDROID_FOCUSED_POLL_MS = 4_000;
const INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS = 1_500;
const INVITE_INBOX_ANDROID_DEBOUNCE_MS = 2_500;
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
}: {
  linkedMatchId?: string | null;
  state?: RunningMatchRoom['state'] | null;
}) {
  if (linkedMatchId) {
    return {
      enabled: false,
      intervalMs: 5000,
      owner: 'linked match status',
      reason: `${state ?? 'linked'}-live-match-handoff`,
    };
  }

  return {
    enabled: true,
    intervalMs: getFocusedInviteInboxPollMs(),
    owner: 'match-room snapshot',
    reason: 'waiting-room-sync',
  };
}
