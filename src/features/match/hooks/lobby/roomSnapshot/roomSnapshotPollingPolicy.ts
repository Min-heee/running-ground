import { Platform } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';
import { resolveMatchRoomSnapshotPollingDecision } from './roomSnapshotPollingDecision';

// Android was 4000ms poll + 2500ms debounce → a party GUEST's lobby took ~4-6.5s to observe the
// host's 시작 (linkedMatchId), longer than the host's arming buffer, so the guest lingered in the
// 대기실 while the host already armed/measured. Party start has NO realtime push — it's pure
// /rooms/my polling — so the guest must poll fast enough to catch the host-start within the buffer.
// Bring Android in line with iOS (~1.5s observe latency) so the guest routes to running during the
// 로딩중 buffer and reaches the synced 10s countdown with the host. (Debounce must stay below the
// poll interval or it caps the effective cadence.)
const INVITE_INBOX_ANDROID_FOCUSED_POLL_MS = 1_500;
const INVITE_INBOX_DEFAULT_FOCUSED_POLL_MS = 1_500;
const INVITE_INBOX_ANDROID_DEBOUNCE_MS = 1_000;
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
