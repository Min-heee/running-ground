import { useEffect, useMemo, useState } from 'react';
import {
  buildMatchDateOptions,
  formatMatchDateKey,
  parseDuelMatchDistanceKm,
  resolveMatchTimeSection,
  type MatchTimeSection,
} from '@/features/runs/utils/matchScheduling';
import type {
  GroupMatchParticipant,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type { MatchLifecycleSlotParams, MatchModeTestFlowParams } from './types';

type UseGroupMatchLifecycleParams = MatchLifecycleSlotParams & MatchModeTestFlowParams;

export function useGroupMatchLifecycle({
  initialMatchSlot,
  slotOptions,
  focusRequestedTest,
  matchMode,
}: UseGroupMatchLifecycleParams) {
  const [groupDistanceText, setGroupDistanceText] = useState('5');
  const [showGroupCustomDistanceInput, setShowGroupCustomDistanceInput] = useState(false);
  const [selectedGroupSlotStartAt, setSelectedGroupSlotStartAt] = useState(() => initialMatchSlot?.startsAt ?? new Date().toISOString());
  const [selectedGroupDateKey, setSelectedGroupDateKey] = useState(() => initialMatchSlot?.dateKey ?? formatMatchDateKey(new Date()));
  const [selectedGroupTimeSection, setSelectedGroupTimeSection] = useState<MatchTimeSection>(() => (
    resolveMatchTimeSection(initialMatchSlot?.startsAt ?? new Date().toISOString())
  ));
  const [isRequestingGroupMatch, setIsRequestingGroupMatch] = useState(false);
  const [groupMatchResult, setGroupMatchResult] = useState<RequestGroupMatchResponse | null>(null);
  const [groupMatchStatus, setGroupMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isCancelingGroupMatch, setIsCancelingGroupMatch] = useState(false);
  const [isLeavingGroupMatch, setIsLeavingGroupMatch] = useState(false);
  const [groupMatchNotice, setGroupMatchNotice] = useState<string | null>(null);

  const groupDistanceKm = useMemo(() => parseDuelMatchDistanceKm(groupDistanceText), [groupDistanceText]);
  const groupDateOptions = useMemo(() => buildMatchDateOptions(slotOptions), [slotOptions]);
  const selectedGroupSlot = slotOptions.find((slot) => slot.startsAt === selectedGroupSlotStartAt) ?? slotOptions[0] ?? null;
  const visibleGroupSlotOptions = useMemo(
    () => slotOptions.filter((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedGroupTimeSection
    )),
    [selectedGroupDateKey, selectedGroupTimeSection, slotOptions],
  );
  const activeGroupSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
  const groupMatchState = groupMatchStatus?.state ?? 'idle';
  const isGroupTestFlow = Boolean(
    groupMatchStatus?.isTestMatch
    || groupMatchResult?.isTestMatch
    || (focusRequestedTest && matchMode === 'group'),
  );
  const effectiveGroupParticipants = (groupMatchStatus?.participants ?? groupMatchResult?.participants ?? []) as GroupMatchParticipant[];
  const effectiveGroupParticipantCount = groupMatchStatus?.participantCount ?? groupMatchResult?.participantsCount ?? effectiveGroupParticipants.length;
  const effectiveGroupSeedRank = groupMatchStatus?.mySeedRank ?? groupMatchResult?.mySeedRank;

  useEffect(() => {
    if (selectedGroupSlot) {
      setSelectedGroupDateKey(selectedGroupSlot.dateKey);
    }
  }, [selectedGroupSlot]);

  const selectNextGroupSlotForDate = (dateKey: string, preferredSection = selectedGroupTimeSection) => {
    const nextSlot = slotOptions.find((slot) => (
      slot.dateKey === dateKey &&
      resolveMatchTimeSection(slot.startsAt) === preferredSection &&
      !slot.isClosed
    ))
      ?? slotOptions.find((slot) => (
        slot.dateKey === dateKey &&
        resolveMatchTimeSection(slot.startsAt) === preferredSection
      ))
      ?? slotOptions.find((slot) => slot.dateKey === dateKey && !slot.isClosed)
      ?? slotOptions.find((slot) => slot.dateKey === dateKey)
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
      setSelectedGroupTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };

  const selectGroupTimeSection = (section: MatchTimeSection) => {
    setSelectedGroupTimeSection(section);
    const nextSlot = slotOptions.find((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? slotOptions.find((slot) => (
        slot.dateKey === selectedGroupDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
    }
  };

  return {
    groupDistanceText,
    setGroupDistanceText,
    showGroupCustomDistanceInput,
    setShowGroupCustomDistanceInput,
    selectedGroupSlotStartAt,
    setSelectedGroupSlotStartAt,
    selectedGroupDateKey,
    setSelectedGroupDateKey,
    selectedGroupTimeSection,
    setSelectedGroupTimeSection,
    isRequestingGroupMatch,
    setIsRequestingGroupMatch,
    groupMatchResult,
    setGroupMatchResult,
    groupMatchStatus,
    setGroupMatchStatus,
    isCancelingGroupMatch,
    setIsCancelingGroupMatch,
    isLeavingGroupMatch,
    setIsLeavingGroupMatch,
    groupMatchNotice,
    setGroupMatchNotice,
    groupDistanceKm,
    groupSlotOptions: slotOptions,
    groupDateOptions,
    selectedGroupSlot,
    visibleGroupSlotOptions,
    activeGroupSlotStartAt,
    groupMatchState,
    isGroupTestFlow,
    effectiveGroupParticipants,
    effectiveGroupParticipantCount,
    effectiveGroupSeedRank,
    selectNextGroupSlotForDate,
    selectGroupTimeSection,
  };
}
