import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
} from '@/lib/api/types';

export type GroupLiveStanding = GroupMatchParticipant & {
  rank: number;
  currentDistanceKm: number;
  gapAheadKm: number | null;
  gapLeaderKm: number;
  isForfeited: boolean;
  isCurrentUser: boolean;
};

export type LastSyncedMatchProgress = {
  matchId: string;
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  updatedAt: number;
};

export type MatchProgressParticipant = {
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  averagePace?: string;
  officialReady?: boolean;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
};

export type RawMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  updatedAt?: string;
  hasProgress: boolean;
};

export type OfficialMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  rank?: number;
  gapAheadKm?: number | null;
  gapLeaderKm?: number;
  comparedAt?: string;
  ready: boolean;
};

export type DisplayMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  source: 'official' | 'raw' | 'estimated' | 'empty';
  hasProgress: boolean;
};

export type MatchProgressModel = {
  rawProgress: RawMatchProgress;
  officialProgress: OfficialMatchProgress | null;
  displayProgress: DisplayMatchProgress;
};

export type DuelComparisonSnapshot = {
  checkpointSeconds: number;
  currentDistanceKm: number;
  opponentDistanceKm: number;
  gapKm: number;
};

export type ParticipantAveragePaceInput = Pick<
  DuelMatchOpponent,
  'liveDistanceKm' | 'liveElapsedSeconds' | 'livePace' | 'liveUpdatedAt' | 'officialAveragePace'
>;
