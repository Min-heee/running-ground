export type RunMatchResult = {
  mode: 'duel' | 'group';
  title: string;
  summary: string;
  badgeLabel: string;
  opponentName?: string;
  resultTone?: 'win' | 'lose' | 'draw';
  rank?: number;
  participantCount?: number;
  gapKm?: number;
  comparedDistanceKm?: number;
};

export type OfflineRaceStatus =
  | 'registration_open'
  | 'registration_closing'
  | 'registration_closed'
  | 'live'
  | 'finished';

export type OfflineRaceParticipantPreview = {
  id: string;
  name: string;
  paceGoal: string;
  regionLabel: string;
};

export type OfflineRaceEvent = {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: number;
  hostLabel: string;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  operationNote: string;
  registered: boolean;
  status: OfflineRaceStatus;
  participantPreview: OfflineRaceParticipantPreview[];
};

export type OfflineRacePastEvent = {
  id: string;
  title: string;
  distanceKm: number;
  finishedAt: string;
  modeLabel: string;
  winnerName: string;
  finishers: number;
  summary: string;
};

export type OfflineRaceHub = {
  featuredEvent: OfflineRaceEvent | null;
  upcomingEvents: OfflineRaceEvent[];
  pastEvents: OfflineRacePastEvent[];
  guideSteps: string[];
};
