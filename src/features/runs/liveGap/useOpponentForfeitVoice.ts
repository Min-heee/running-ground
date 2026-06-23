// Speaks a one-shot Korean TTS announcement when an OPPONENT (duel) or any OTHER
// participant (group) forfeits an active live match, so a runner with the screen off /
// phone in pocket hears that someone quit. Reuses the gap-voice TTS pipeline
// (speakLiveGapMessage: ko-KR, ducks audio, OTA-safe no-op on binaries without
// expo-speech) and the gap-push delivery-mode setting (voice gates the announcement).
//
// Detection is delegated to the pure selectNewlyForfeitedAnnouncements so the dedup /
// current-user-exclusion / message rules are unit-testable; this hook is the thin React
// shell: it reads the latest live data through refs (no per-render cost) and runs the
// detection in an effect keyed on a cheap forfeited-ids signal, NOT on every render.

import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  getLiveGapPushConfig,
  subscribeLiveGapPushConfig,
} from '@/features/runs/liveGap/liveGapPushConfig';
import {
  buildForfeitAnnouncementSpeech,
  selectNewlyForfeitedAnnouncements,
  type ForfeitOpponentInput,
} from '@/features/runs/liveGap/opponentForfeitAnnouncements';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';

export type OpponentForfeitVoiceInput = {
  // Active live match gate: true only while running a duel/group match.
  active: boolean;
  matchMode: 'duel' | 'group';
  // Duel opponent (post forfeit-latch) — read for its liveStatus / id / name.
  opponent?: ForfeitOpponentInput;
  // Group standings — each carries isForfeited / isCurrentUser / id / name.
  standings?: readonly GroupLiveStanding[];
};

// Cheap, render-stable signal that changes only when the SET of non-current-user
// forfeiters changes. Used as the effect key so detection runs on forfeit transitions,
// not on every GPS-driven re-render. matchMode is included so a duel→group switch (same
// component instance) re-evaluates.
function buildForfeitSignal(input: OpponentForfeitVoiceInput): string {
  if (input.matchMode === 'duel') {
    const forfeited = input.opponent?.liveStatus === 'forfeited';
    return forfeited ? `duel:${input.opponent?.id ?? ''}` : 'duel:';
  }

  const ids: string[] = [];
  for (const standing of input.standings ?? []) {
    if (standing.isForfeited && !standing.isCurrentUser && standing.id) {
      ids.push(standing.id);
    }
  }
  // Order-independent so a standings re-sort (forfeiters sink to the bottom) doesn't
  // re-trigger; the set membership is what matters.
  ids.sort();
  return `group:${ids.join(',')}`;
}

export function useOpponentForfeitVoice(input: OpponentForfeitVoiceInput) {
  const config = useSyncExternalStore(
    subscribeLiveGapPushConfig,
    getLiveGapPushConfig,
    getLiveGapPushConfig,
  );

  // Forfeit is an event, not a periodic metric: gate ONLY on the match being active and
  // voice delivery being enabled. Do NOT gate on interval/metrics.
  const voiceEnabled = config.deliveryMode === 'voice' || config.deliveryMode === 'both';
  const announcerActive = input.active && voiceEnabled;

  const inputRef = useRef(input);
  inputRef.current = input;

  // Forfeiter ids already announced THIS match. Reset when the announcer goes inactive
  // (match over / not running / voice disabled) so the next match starts clean.
  const announcedIdsRef = useRef<Set<string>>(new Set());

  const forfeitSignal = announcerActive ? buildForfeitSignal(input) : 'inactive';

  useEffect(() => {
    if (!announcerActive) {
      // Match ended / not running / voice off — clear so the next match re-announces.
      announcedIdsRef.current.clear();
      return;
    }

    const latest = inputRef.current;
    const announcements = selectNewlyForfeitedAnnouncements({
      matchMode: latest.matchMode,
      opponent: latest.opponent,
      standings: latest.standings,
      alreadyAnnounced: announcedIdsRef.current,
    });

    if (announcements.length === 0) {
      return;
    }

    // Mark every newly-detected forfeiter as announced up front so a rapid re-run can't
    // double-speak.
    for (const announcement of announcements) {
      announcedIdsRef.current.add(announcement.id);
    }

    // Fold same-tick forfeiters into ONE utterance — the TTS layer stops any prior
    // utterance, so speaking them one-by-one would clip all but the last.
    // Fire-and-forget: speakLiveGapMessage never throws, but void it explicitly so a
    // rejected promise can never bubble into the match loop.
    void speakLiveGapMessage(buildForfeitAnnouncementSpeech(announcements));
  }, [announcerActive, forfeitSignal]);
}
