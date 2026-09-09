export type ArenaResultLabel = 'WIN' | 'LOSE' | 'DRAW';

export type ArenaParticipant = {
  id: string;
  name: string;
  paceLabel: string;
  bpmLabel?: string | null;
  distanceKm: number;
  rankLabel?: string;
  resultLabel?: ArenaResultLabel | null;
  finishedAt?: string | null;
  isCurrentUser?: boolean;
  isLeader?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
  // 부정 러닝 실격 기권 — forfeited 시각 상태에 '실격' 라벨.
  disqualified?: boolean;
  showPaceBubble?: boolean;
  emphasis?: 'featured' | 'compact';
};
