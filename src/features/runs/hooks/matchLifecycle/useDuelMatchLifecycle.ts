import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMatchDateOptions,
  formatMatchDateKey,
  parseDuelMatchDistanceKm,
  resolveMatchTimeSection,
  type MatchTimeSection,
} from '@/features/runs/utils/matchScheduling';
import type {
  RequestDuelMatchResponse,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import { rgDiagLog } from '@/utils/rgPerfTrace';
import { findMatchSlotByStartAt } from './matchSlotSelection';
import type { MatchLifecycleSlotParams, MatchModeTestFlowParams } from './types';

type UseDuelMatchLifecycleParams = MatchLifecycleSlotParams & MatchModeTestFlowParams;

export function useDuelMatchLifecycle({
  initialMatchSlot,
  slotOptions,
  focusRequestedTest,
  matchMode,
}: UseDuelMatchLifecycleParams) {
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
  const [duelMatchNotice, setDuelMatchNotice] = useState<string | null>(null);
  const lastDuelSlotFindMissKeyRef = useRef<string | null>(null);

  const duelDistanceKm = useMemo(() => parseDuelMatchDistanceKm(duelDistanceText), [duelDistanceText]);
  const duelDateOptions = useMemo(() => buildMatchDateOptions(slotOptions), [slotOptions]);
  const matchedDuelSlot = findMatchSlotByStartAt(slotOptions, selectedDuelSlotStartAt);
  const selectedDuelSlot = matchedDuelSlot ?? slotOptions[0] ?? null;
  const visibleDuelSlotOptions = useMemo(
    () => slotOptions.filter((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === selectedDuelTimeSection
    )),
    [selectedDuelDateKey, selectedDuelTimeSection, slotOptions],
  );
  const activeDuelSlotStartAt = selectedDuelSlot?.startsAt ?? selectedDuelSlotStartAt;
  const duelMatchState = duelMatchStatus?.state ?? 'idle';
  const isDuelTestFlow = Boolean(
    duelMatchStatus?.isTestMatch
    || duelMatchResult?.isTestMatch
    || (focusRequestedTest && matchMode === 'duel'),
  );

  useEffect(() => {
    if (matchedDuelSlot || slotOptions.length === 0) {
      return;
    }

    const missKey = [
      selectedDuelSlotStartAt,
      slotOptions.length,
      slotOptions[0]?.startsAt ?? '',
      slotOptions[slotOptions.length - 1]?.startsAt ?? '',
    ].join('|');

    if (lastDuelSlotFindMissKeyRef.current === missKey) {
      return;
    }

    lastDuelSlotFindMissKeyRef.current = missKey;
    rgDiagLog('duel slot find miss', {
      fallbackTo: slotOptions[0]?.startsAt ?? null,
      firstSlotStartsAt: slotOptions[0]?.startsAt ?? null,
      lastSlotStartsAt: slotOptions[slotOptions.length - 1]?.startsAt ?? null,
      selectedDuelSlotStartAt,
      slotOptionsCount: slotOptions.length,
    });
  }, [matchedDuelSlot, selectedDuelSlotStartAt, slotOptions]);

  useEffect(() => {
    if (selectedDuelSlot) {
      setSelectedDuelDateKey(selectedDuelSlot.dateKey);
    }
  }, [selectedDuelSlot]);

  const selectNextDuelSlotForDate = (dateKey: string, preferredSection = selectedDuelTimeSection) => {
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
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
      setSelectedDuelTimeSection(resolveMatchTimeSection(nextSlot.startsAt));
    }
  };

  const selectDuelTimeSection = (section: MatchTimeSection) => {
    setSelectedDuelTimeSection(section);
    const nextSlot = slotOptions.find((slot) => (
      slot.dateKey === selectedDuelDateKey &&
      resolveMatchTimeSection(slot.startsAt) === section &&
      !slot.isClosed
    ))
      ?? slotOptions.find((slot) => (
        slot.dateKey === selectedDuelDateKey &&
        resolveMatchTimeSection(slot.startsAt) === section
      ))
      ?? null;

    if (nextSlot) {
      setSelectedDuelSlotStartAt(nextSlot.startsAt);
    }
  };

  return {
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
    duelMatchNotice,
    setDuelMatchNotice,
    duelDistanceKm,
    duelSlotOptions: slotOptions,
    duelDateOptions,
    selectedDuelSlot,
    visibleDuelSlotOptions,
    activeDuelSlotStartAt,
    duelMatchState,
    isDuelTestFlow,
    selectNextDuelSlotForDate,
    selectDuelTimeSection,
  };
}
