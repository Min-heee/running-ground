type TrackRunActiveRoomCheckLiveSkipInput = {
  linkedMatchId?: string | null;
  liveMatchKey?: string | null;
  liveMatchMounted?: boolean;
};

export type TrackRunActiveRoomCheckLiveSkipReason =
  | 'linked-match'
  | 'live-match-key'
  | 'live-match-mounted';

export function getTrackRunActiveRoomCheckLiveSkipReason({
  linkedMatchId,
  liveMatchKey,
  liveMatchMounted,
}: TrackRunActiveRoomCheckLiveSkipInput): TrackRunActiveRoomCheckLiveSkipReason | null {
  if (liveMatchMounted) {
    return 'live-match-mounted';
  }

  if (liveMatchKey) {
    return 'live-match-key';
  }

  if (linkedMatchId) {
    return 'linked-match';
  }

  return null;
}
