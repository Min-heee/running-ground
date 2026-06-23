// Pure detection for the opponent-forfeit voice announcement. Given the current live
// match snapshot and the set of forfeiter ids we've ALREADY announced, this returns the
// NEW forfeit announcements to speak (one per not-yet-announced, non-current-user
// forfeiter). Kept side-effect-free and dependency-free so the hook stays a thin shell and
// the dedup / exclusion / message rules are unit-testable in isolation.

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';

export type ForfeitAnnouncementMatchMode = 'duel' | 'group';

// Minimal shape of the duel opponent we read — only the forfeit signal, a stable id, and
// the display name. `liveStatus === 'forfeited'` is the authoritative live forfeit signal
// (mirrors isDuelOpponentForfeited in liveMatchProgressModel) and the runtime's
// forfeit-latch keeps it 'forfeited' once seen, so a one-shot announcement never regresses.
export type ForfeitOpponentInput = {
  id?: string | null;
  name?: string | null;
  liveStatus?: string | null;
} | null;

export type ForfeitAnnouncement = {
  id: string;
  text: string;
  // Trimmed display name (null when unknown) — lets the caller fold several same-tick
  // forfeiters into ONE utterance via buildForfeitAnnouncementSpeech.
  name: string | null;
};

export type SelectForfeitAnnouncementsInput = {
  matchMode: ForfeitAnnouncementMatchMode;
  opponent?: ForfeitOpponentInput;
  standings?: readonly GroupLiveStanding[];
  // Forfeiter ids already announced this match; used to dedup so each is spoken once.
  alreadyAnnounced: ReadonlySet<string>;
};

// Stable fallback id for a duel when the opponent object has no id — there is only ever
// one duel opponent, so a constant key is enough to dedup the single announcement.
export const DUEL_OPPONENT_FALLBACK_ID = 'duel-opponent';

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed ? trimmed : null;
}

// Single-forfeiter message (duel opponent or one group participant). Same wording for both
// modes — a named forfeiter reads "{name}님이 기권했어요", an unknown one "상대가 기권했어요".
function buildForfeitMessage(name: string | null): string {
  return name ? `${name}님이 기권했어요` : '상대가 기권했어요';
}

// Folds 1..N same-tick forfeit announcements into ONE utterance, because the TTS layer
// (speakLiveGapMessage → Speech.stop) drops any prior utterance, so speaking them one-by-one
// would clip all but the last. One forfeiter → its own message; several named → "A님, B님이
// 기권했어요"; any name unknown → "여러 명이 기권했어요".
export function buildForfeitAnnouncementSpeech(announcements: readonly ForfeitAnnouncement[]): string {
  if (announcements.length === 0) {
    return '';
  }
  if (announcements.length === 1) {
    return announcements[0].text;
  }

  const names = announcements.map((announcement) => announcement.name);
  if (names.every((name): name is string => Boolean(name))) {
    return `${names.join('님, ')}님이 기권했어요`;
  }
  return '여러 명이 기권했어요';
}

// Returns the newly-forfeited announcements (id + ko text) NOT yet in `alreadyAnnounced`.
// - duel: the single opponent, when its liveStatus is 'forfeited' (it is, by definition,
//   never the current user).
// - group: every standing that isForfeited && !isCurrentUser.
// The current user's own forfeit is never returned. Order follows the standings order so
// callers that speak only the last (newest) one get a deterministic result.
export function selectNewlyForfeitedAnnouncements({
  matchMode,
  opponent,
  standings,
  alreadyAnnounced,
}: SelectForfeitAnnouncementsInput): ForfeitAnnouncement[] {
  const announcements: ForfeitAnnouncement[] = [];

  if (matchMode === 'duel') {
    if (opponent && opponent.liveStatus === 'forfeited') {
      const id = (opponent.id && opponent.id.trim()) || DUEL_OPPONENT_FALLBACK_ID;
      if (!alreadyAnnounced.has(id)) {
        const name = normalizeName(opponent.name);
        announcements.push({ id, name, text: buildForfeitMessage(name) });
      }
    }
    return announcements;
  }

  // group
  for (const standing of standings ?? []) {
    if (!standing.isForfeited || standing.isCurrentUser) {
      continue;
    }

    const id = standing.id;
    if (!id || alreadyAnnounced.has(id)) {
      continue;
    }

    const name = normalizeName(standing.name);
    announcements.push({ id, name, text: buildForfeitMessage(name) });
  }

  return announcements;
}
