// 그라운드 (2026-08-06): 친구와 기간을 정해 거리/시간 총합으로 겨루는 포인트 내기.

export type RunmadangMetric = 'distance' | 'duration';

export type RunmadangStatus = 'upcoming' | 'running' | 'finished' | 'settled' | 'cancelled';

export type RunmadangRole = 'host' | 'participant' | 'invited' | 'declined';

export type RunmadangStandingRow = {
  userId: string;
  name: string;
  rank: number;
  // distance면 km(소수 2자리), duration이면 초.
  value: number;
  runCount: number;
  isMe: boolean;
};

export type RunmadangChallenge = {
  id: string;
  // 판 이름. 이름 도입 전 구서버 응답엔 없을 수 있다.
  title?: string;
  metric: RunmadangMetric;
  stakePoints: number;
  startAt: string;
  endAt: string;
  status: RunmadangStatus;
  hostUserId: string;
  hostName: string;
  participantCount: number;
  potPoints: number;
  // 정산 후 내가 받은 실수령액 (동률 분배 반영). 미정산·미수령이면 0. 구서버 응답엔 없음.
  myPayoutPoints?: number;
  myRole: RunmadangRole;
  canJoin: boolean;
  canCancel: boolean;
  // 시작 전 참가 철회(판돈 환불) 가능 여부 — 호스트가 아닌 참가자. 구서버 응답엔 없음.
  canWithdraw?: boolean;
  // 미참가 초대자에게는 서버가 순위를 숨긴다(빈 배열) — 보고 참가 여부를 정하는 무위험
  // 옵션 방지.
  standings: RunmadangStandingRow[];
  winnerUserIds: string[] | null;
  resultTone: 'win' | 'void' | null;
  settledAt: string | null;
  createdAt: string;
};

export type RunmadangMineResponse = {
  challenges: RunmadangChallenge[];
  availablePoints: number;
};

export type CreateRunmadangInput = {
  title: string;
  metric: RunmadangMetric;
  stakePoints: number;
  periodPreset?: '3d' | '1w' | '2w' | '1m';
  startDate?: string;
  endDate?: string;
  invitedFriendIds: string[];
};
