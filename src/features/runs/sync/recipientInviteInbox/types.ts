import type { RunningMatchRoom, RunningMatchRoomResponse } from '@/lib/api/types';

type RecipientInviteInboxTracePayloadValue = string | number | boolean | null | undefined;

export type RecipientInviteInboxRuntimeState = {
  activeRoomId: string | null;
  isLiveMatchMounted: boolean;
  linkedMatchId: string | null;
  liveMatchKey: string | null;
};

export type RecipientInviteInboxTraceEvent = {
  name: string;
  payload: Record<string, RecipientInviteInboxTracePayloadValue>;
};

export type RecipientInviteInboxFetchResult =
  | {
    payload: RunningMatchRoomResponse;
    timedOut: false;
  }
  | {
    timedOut: true;
  };

export type RecipientInviteInboxRoomContext = {
  currentUserId: string;
  room: RunningMatchRoom | null | undefined;
  source: string;
};
