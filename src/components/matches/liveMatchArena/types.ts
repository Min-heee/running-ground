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
  showPaceBubble?: boolean;
  emphasis?: 'featured' | 'compact';
};
