import type { MatchSlotOption, MatchTimeSection } from '@/features/runs/utils/matchScheduling';

export type RunMatchMode = 'solo' | 'duel' | 'group' | 'room';

export type InitialMatchSlot = MatchSlotOption | null;

export type MatchLifecycleSlotParams = {
  initialMatchSlot: InitialMatchSlot;
  slotOptions: MatchSlotOption[];
};

export type MatchModeTestFlowParams = {
  focusRequestedTest: boolean;
  matchMode: RunMatchMode;
};

export type MatchTimeSectionSelector = (section: MatchTimeSection) => void;
