import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GroupMatchParticipant,
  type MatchDemandSummaryResponse,
  type RequestDuelMatchResponse,
  type RequestGroupMatchResponse,
  type RunningMatchStatusResponse,
  type UpcomingRunningMatchItem,
} from '@/lib/api/types';
import {
  buildMatchDateOptions,
  buildWeeklyHourlySlots,
  formatMatchDateKey,
  parseDuelMatchDistanceKm,
  resolveMatchTimeSection,
  type MatchTimeSection,
} from '@/features/runs/matchScheduling';
import {
  parseServerNowMs,
  resolveStableServerClockOffset,
} from '@/features/runs/serverClockSync';

export type RunMatchMode = 'solo' | 'duel' | 'group' | 'room';

type TestFlowInput = {
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchIsTest?: boolean;
};

export function useMatchLifecycle({ focusMatchMode, focusMatchIsTest }: TestFlowInput) {
  const initialMatchSlotOptions = buildWeeklyHourlySlots();
  const initialMatchSlot = initialMatchSlotOptions.find((slot) => !slot.isClosed) ?? initialMatchSlotOptions[0];
  const serverClockOffsetMsRef = useRef(0);

  const [matchMode, setMatchMode] = useState<RunMatchMode>('duel');
  const [duelDistanceText, setDuelDistanceText] = useState('5');
  const [showDuelCustomDistanceInput, setShowDuelCustomDistanceInput] = useState(false);
  const [selectedDuelSlotStartAt, setSelectedDuelSlotStartAt] = useState(() => initialMatchSlot?.startsAt ?? new Date().toISOString());
  const [selectedDuelDateKey, setSelectedDuelDateKey] = useState(() => initialMatchSlot?.dateKey ?? formatMatchDateKey(new Date()));
  const [selectedDuelTimeSection, setSelectedDuelTimeSection] = useState<MatchTimeSection>(() => (
    resolveMatchTimeSection(initialMatchSlot?.startsAt ?? new Date().toISOString())
  ));
  const [isRequestingDuelMatch, setIsRequestingDuelMatch] = useState(false);
  const [duelMatchResult, setDuelMatchResult] = useState<RequestDuelMatchResponse | null>(null);
  const [duelMatchStatus, setDuelMatchStatus] = useState<RunningMatchStatusResponse | null>(null);
  const [isCancelingDuelMatch, setIsCancelingDuelMatch] = useState(false);
  const [isLeavingDuelMatch, setIsLeavingDuelMatch] = useState(false);
  const [duelDemandSummary, setDuelDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingDuelDemandSummary, setIsLoadingDuelDemandSummary] = useState(false);
  const [duelMatchNotice, setDuelMatchNotice] = useState<string | null>(null);

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
  const [groupDemandSummary, setGroupDemandSummary] = useState<MatchDemandSummaryResponse | null>(null);
  const [isLoadingGroupDemandSummary, setIsLoadingGroupDemandSummary] = useState(false);
  const [groupMatchNotice, setGroupMatchNotice] = useState<string | null>(null);

  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingUpcomingMatchId, setCancelingUpcomingMatchId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [liveArenaPage, setLiveArenaPage] = useState(0);
  const [forceOpenActiveMatch, setForceOpenActiveMatch] = useState(false);
  const [isResolvingFocusedMatch, setIsResolvingFocusedMatch] = useState(false);

  const syncedNowMs = nowMs + serverClockOffsetMs;
  const duelDistanceKm = useMemo(() => parseDuelMatchDistanceKm(duelDistanceText), [duelDistanceText]);
  const groupDistanceKm = useMemo(() => parseDuelMatchDistanceKm(groupDistanceText), [groupDistanceText]);
  const weeklyMatchSlotOptions = buildWeeklyHourlySlots();
  const duelSlotOptions = weeklyMatchSlotOptions;
  const groupSlotOptions = weeklyMatchSlotOptions;
  const duelDateOptions = useMemo(() => buildMatchDateOptions(duelSlotOptions), [duelSlotOptions]);
  const groupDateOptions = useMemo(() => buildMatchDateOptions(groupSlotOptions), [groupSlotOptions]);
  const selectedDuelSlot = duelSlotOptions.find((slot) => slot.startsAt === selectedDuelSlotStartAt) ?? duelSlotOptions[0] ?? null;
  const selectedGroupSlot = groupSlotOptions.find((slot) => slot.startsAt === selectedGroupSlotStartAt) ?? groupSlotOptions[0] ?? null;
  const visibleDuelSlotOptions = useMemo(
    () => duelSlotOptions.filter((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedDuelTimeSection
    )),
    [duelSlotOptions, selectedDuelDateKey, selectedDuelTimeSection],
  );
  const visibleGroupSlotOptions = useMemo(
    () => groupSlotOptions.filter((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedGroupTimeSection
    )),
    [groupSlotOptions, selectedGroupDateKey, selectedGroupTimeSection],
  );
  const activeDuelSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
  const activeGroupSlotStartAt = selectedGroupSlot?.startsAt ?? selectedGroupSlotStartAt;
  const duelMatchState = duelMatchStatus?.state ?? 'idle';
  const groupMatchState = groupMatchStatus?.state ?? 'idle';
  const focusRequestedDuelTest = focusMatchMode === 'duel' && focusMatchIsTest === true;
  const focusRequestedGroupTest = focusMatchMode === 'group' && focusMatchIsTest === true;
  const isDuelTestFlow = Boolean(
    duelMatchStatus?.isTestMatch
    || duelMatchResult?.isTestMatch
    || (focusRequestedDuelTest && matchMode === 'duel'),
  );
  const isGroupTestFlow = Boolean(
    groupMatchStatus?.isTestMatch
    || groupMatchResult?.isTestMatch
    || (focusRequestedGroupTest && matchMode === 'group'),
  );

  useEffect(() => {
    serverClockOffsetMsRef.current = serverClockOffsetMs;
  }, [serverClockOffsetMs]);

  useEffect(() => {
    if (selectedDuelSlot) {
      setSelectedDuelDateKey(selectedDuelSlot.dateKey);
    }
  }, [selectedDuelSlot]);

  useEffect(() => {
    if (selectedGroupSlot) {
      setSelectedGroupDateKey(selectedGroupSlot.dateKey);
    }
  }, [selectedGroupSlot]);

  const syncServerClock = (serverNow?: string) => {
    const serverNowMs = parseServerNowMs(serverNow);
    if (serverNowMs === null) {
      return;
    }

    const nextOffsetMs = serverNowMs - Date.now();
    setServerClockOffsetMs((currentOffsetMs) => {
      const stableOffsetMs = resolveStableServerClockOffset(currentOffsetMs, nextOffsetMs);
      serverClockOffsetMsRef.current = stableOffsetMs;
      return stableOffsetMs;
    });
  };

  const getSyncedNowMs = () => Date.now() + serverClockOffsetMsRef.current;

  const selectNextDuelSlotForDate = (dateKey: string, preferredSection = selectedDuelTimeSection) => {
    const nextSlot = duelSlotOptions.find((slot) => (
      slot.dateKey === dateKey &&
      resolveMatchTimeSection(slot.startsAt) === preferredSection &&
      !slot.isClosed
    ))
      ?? duelSlotOptions.find((slot) => (
        slot.dateKey === dateKey &&
        resolveMatchTimeSection(slot.startsAt) === preferredSection
      ))
      ?? duelSlotOptions.find((slot) => slot.dateKey === dateKey && !slot.isClosed)
      ?? duelSlotOptions.find((slot) => slot.dateKey === dateKey)
      ?? null;

    if (nextSlot) {
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
      setSelectedDuelTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };

  const selectNextGroupSlotForDate = (dateKey: string, preferredSection = selectedGroupTimeSection) => {
    const nextSlot = groupSlotOptions.find((slot) => (
      slot.dateKey === dateKey &&
      resolveMatchTimeSection(slot.startsAt) === preferredSection &&
      !slot.isClosed
    ))
      ?? groupSlotOptions.find((slot) => (
        slot.dateKey === dateKey &&
        resolveMatchTimeSection(slot.startsAt) === preferredSection
      ))
      ?? groupSlotOptions.find((slot) => slot.dateKey === dateKey && !slot.isClosed)
      ?? groupSlotOptions.find((slot) => slot.dateKey === dateKey)
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
      setSelectedGroupTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };

  const selectDuelTimeSection = (section: MatchTimeSection) => {
    setSelectedDuelTimeSection(section);
    const nextSlot = duelSlotOptions.find((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? duelSlotOptions.find((slot) => (
        slot.dateKey === selectedDuelDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
    }
  };

  const selectGroupTimeSection = (section: MatchTimeSection) => {
    setSelectedGroupTimeSection(section);
    const nextSlot = groupSlotOptions.find((slot) => (
      slot.dateKey === selectedGroupDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? groupSlotOptions.find((slot) => (
        slot.dateKey === selectedGroupDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedGroupSlotStartAt(nextSlot.startsAt);
    }
  };

  const effectiveGroupParticipants = (groupMatchStatus?.participants ?? groupMatchResult?.participants ?? []) as GroupMatchParticipant[];
  const effectiveGroupParticipantCount = groupMatchStatus?.participantCount ?? groupMatchResult?.participantsCount ?? effectiveGroupParticipants.length;
  const effectiveGroupSeedRank = groupMatchStatus?.mySeedRank ?? groupMatchResult?.mySeedRank;

  return {
    matchMode,
    setMatchMode,
    duelDistanceText,
    setDuelDistanceText,
    showDuelCustomDistanceInput,
    setShowDuelCustomDistanceInput,
    selectedDuelSlotStartAt,
    setSelectedDuelSlotStartAt,
    selectedDuelDateKey,
    setSelectedDuelDateKey,
    selectedDuelTimeSection,
    setSelectedDuelTimeSection,
    isRequestingDuelMatch,
    setIsRequestingDuelMatch,
    duelMatchResult,
    setDuelMatchResult,
    duelMatchStatus,
    setDuelMatchStatus,
    isCancelingDuelMatch,
    setIsCancelingDuelMatch,
    isLeavingDuelMatch,
    setIsLeavingDuelMatch,
    duelDemandSummary,
    setDuelDemandSummary,
    isLoadingDuelDemandSummary,
    setIsLoadingDuelDemandSummary,
    duelMatchNotice,
    setDuelMatchNotice,
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
    groupDemandSummary,
    setGroupDemandSummary,
    isLoadingGroupDemandSummary,
    setIsLoadingGroupDemandSummary,
    groupMatchNotice,
    setGroupMatchNotice,
    upcomingMatches,
    setUpcomingMatches,
    matchRemindersEnabled,
    setMatchRemindersEnabled,
    cancelingUpcomingMatchId,
    setCancelingUpcomingMatchId,
    nowMs,
    setNowMs,
    serverClockOffsetMs,
    syncedNowMs,
    serverClockOffsetMsRef,
    syncServerClock,
    getSyncedNowMs,
    liveArenaPage,
    setLiveArenaPage,
    forceOpenActiveMatch,
    setForceOpenActiveMatch,
    isResolvingFocusedMatch,
    setIsResolvingFocusedMatch,
    duelDistanceKm,
    groupDistanceKm,
    duelSlotOptions,
    groupSlotOptions,
    duelDateOptions,
    groupDateOptions,
    selectedDuelSlot,
    selectedGroupSlot,
    visibleDuelSlotOptions,
    visibleGroupSlotOptions,
    activeDuelSlotStartAt,
    activeGroupSlotStartAt,
    duelMatchState,
    groupMatchState,
    focusRequestedDuelTest,
    focusRequestedGroupTest,
    isDuelTestFlow,
    isGroupTestFlow,
    effectiveGroupParticipants,
    effectiveGroupParticipantCount,
    effectiveGroupSeedRank,
    selectNextDuelSlotForDate,
    selectNextGroupSlotForDate,
    selectDuelTimeSection,
    selectGroupTimeSection,
  };
}
