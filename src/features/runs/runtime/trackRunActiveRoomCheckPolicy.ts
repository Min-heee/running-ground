type TrackRunActiveRoomCheckLiveSkipInput = {
  linkedMatchId?: string | null;
  // 예약 파티런(2026-09-09): 링크됐지만 슬롯이 카운트다운 창 밖 — 며칠 동안 상대의 이탈·취소가
  // 생길 수 있으니 링크만으로는 조회를 건너뛰지 않는다.
  linkedMatchReservedForFuture?: boolean;
  liveMatchKey?: string | null;
  liveMatchMounted?: boolean;
};

export type TrackRunActiveRoomCheckLiveSkipReason =
  | 'linked-match'
  | 'live-match-key'
  | 'live-match-mounted';

export function getTrackRunActiveRoomCheckLiveSkipReason({
  linkedMatchId,
  linkedMatchReservedForFuture = false,
  liveMatchKey,
  liveMatchMounted,
}: TrackRunActiveRoomCheckLiveSkipInput): TrackRunActiveRoomCheckLiveSkipReason | null {
  if (liveMatchMounted) {
    return 'live-match-mounted';
  }

  if (liveMatchKey) {
    return 'live-match-key';
  }

  if (linkedMatchId && !linkedMatchReservedForFuture) {
    return 'linked-match';
  }

  return null;
}
