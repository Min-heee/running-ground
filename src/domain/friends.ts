export type FriendRank = {
  id: string;
  rank: number;
  name: string;
  tag?: string;
  distanceKm: number;
  points: number;
  isRunningNow?: boolean;
  liveLocationLabel?: string;
};

export type FriendRequestStatus = 'pending' | 'received' | 'accepted';

export type FriendRequest = {
  id: string;
  name: string;
  tag: string;
  status: FriendRequestStatus;
};

export type FriendRunRecord = {
  id: string;
  date: string;
  distanceKm: number;
  pace: string;
};
