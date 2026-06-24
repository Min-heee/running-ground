import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
  MatchDemandSummaryResponse,
  RunningMatchState,
  RunningMatchStatusResponse,
} from '@/lib/api/types';

export type TimeSection = 'am' | 'pm';

export type BlockingMatchReference = {
  matchId: string;
  distanceKm: number | null;
  slotStartAt: string | null;
  testMode?: boolean;
};

export type MatchDateOption = {
  key: string;
  label: string;
  subtitle: string;
};

export type MatchSlotOption = {
  startsAt: string;
  label: string;
  isClosed: boolean;
};

export type BaseMatchSetupProps = {
  distanceKm: number;
  distanceText: string;
  showCustomDistanceInput: boolean;
  dateOptions: MatchDateOption[];
  selectedDateKey: string;
  selectedTimeSection: TimeSection;
  slotOptions: MatchSlotOption[];
  selectedSlotStartAt: string;
  isRequesting: boolean;
  matchState: RunningMatchState;
  matchStatus: RunningMatchStatusResponse | null;
  activeSlotStartAt: string;
  effectiveSlotLabel: string;
  startCountdownSeconds: number | null;
  matchNotice: string | null;
  needsManualRematch: boolean;
  isCancelingMatch: boolean;
  reservationLocked: boolean;
  canCreateMatch: boolean;
  blockingMatchHelperText: string | null;
  forceLeaveStuckMatchError: string | null;
  isForceLeavingStuckMatch: boolean;
  expiryCountdownLabel: string | null;
  onDistanceTextChange: (text: string) => void;
  onShowCustomDistanceInputChange: (show: boolean) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectTimeSection: (section: TimeSection) => void;
  onSelectSlot: (startsAt: string) => void;
  onCancelMatch: () => void;
  onForceLeaveStuckMatch: () => void;
  onRequestMatch: () => void;
  onRequestRematch: () => void;
};

export type DuelMatchSetupCardProps = BaseMatchSetupProps & {
  opponent: DuelMatchOpponent | null;
  waitingTitle: string;
  opponentStatusLabel: string | null;
  liveGapKm: number | null;
  // Count of people currently searching a 1:1 (duel) match per slot, keyed by the slot's
  // startsAt. Duel-only — GroupMatchSetupCard passes undefined.
  slotDuelCounts?: Record<string, number>;
  // server-synced now (ms), used by the matched reservation waiting room to drive the
  // "N분 남음 / 곧 시작" status off the slot start time.
  syncedNowMs?: number;
};

export type GroupMatchSetupCardProps = BaseMatchSetupProps & {
  isTestFlow: boolean;
  isLoadingDemandSummary: boolean;
  demandSummary: MatchDemandSummaryResponse | null;
  effectiveParticipantCount: number;
  effectiveSeedRank: number | null;
  participants: GroupMatchParticipant[];
};

export type DistanceSelectorProps = Pick<
  BaseMatchSetupProps,
  | 'distanceKm'
  | 'distanceText'
  | 'showCustomDistanceInput'
  | 'onDistanceTextChange'
  | 'onShowCustomDistanceInputChange'
> & {
  chipKeyPrefix: string;
};

export type TimeSlotSelectorProps = Pick<
  BaseMatchSetupProps,
  | 'dateOptions'
  | 'selectedDateKey'
  | 'selectedTimeSection'
  | 'slotOptions'
  | 'selectedSlotStartAt'
  | 'onSelectDate'
  | 'onSelectTimeSection'
  | 'onSelectSlot'
> & {
  dateKeyPrefix: string;
  sectionKeyPrefix: string;
  // Per-slot count of people searching a 1:1 (duel) match, keyed by slot startsAt.
  // Duel-only; the group selector leaves it undefined.
  slotDuelCounts?: Record<string, number>;
};
