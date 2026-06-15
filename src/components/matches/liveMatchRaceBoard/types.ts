import type { DuelResultLabel } from '@/features/runs/types/matchResult';

export type LiveMatchRaceBoardRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel?: string;
  distanceKm: number;
  remainingKm: number;
  progress: number;
  isCurrentUser?: boolean;
  isProgressivePlaceholder?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
  forfeitedAt?: string;
  resultLabel?: DuelResultLabel | null;
};
