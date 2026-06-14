// Pure builders that turn live-match data into the title/body of a gap push
// notification. No side effects, no expo-notifications import — fully unit-testable.

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  LIVE_GAP_GROUP_TARGET_OPTIONS,
  type LiveGapGroupTarget,
} from '@/features/runs/liveGap/liveGapPushConfig';

export type LiveGapMessage = {
  title: string;
  body: string;
};

const MEASURED_PACE_PATTERN = /^(\d{1,2}):(\d{2})\/km$/i;

// Unlike parsePaceSecondsPerKm (which falls back to 5:30 for unmeasured input), this
// returns null when there is no real pace yet — so we never invent a "비슷" comparison
// from placeholder paces like '--:--/km' or '00:00/km'.
export function parseMeasuredPaceSecondsPerKm(paceLabel: string | null | undefined): number | null {
  const matched = String(paceLabel ?? '').trim().match(MEASURED_PACE_PATTERN);

  if (!matched) {
    return null;
  }

  const seconds = Number(matched[1]) * 60 + Number(matched[2]);
  return seconds > 0 ? seconds : null;
}

// My pace relative to the other runner's. Positive direction = I'm faster.
export function buildPaceDiffLabel(
  myPaceLabel: string | null | undefined,
  otherPaceLabel: string | null | undefined,
): string | null {
  const mySeconds = parseMeasuredPaceSecondsPerKm(myPaceLabel);
  const otherSeconds = parseMeasuredPaceSecondsPerKm(otherPaceLabel);

  if (mySeconds === null || otherSeconds === null) {
    return null;
  }

  const diff = Math.round(otherSeconds - mySeconds);

  if (Math.abs(diff) < 1) {
    return '페이스 비슷';
  }

  return diff > 0 ? `${diff}초/km 빠름` : `${Math.abs(diff)}초/km 느림`;
}

type CompactGap = {
  magnitude: string;
  direction: '앞' | '뒤' | '동률';
};

// gapKm is measured from MY perspective: my distance minus theirs.
function buildCompactDistanceGap(gapKm: number): CompactGap {
  const absoluteKm = Math.abs(gapKm);

  if (absoluteKm < 0.005) {
    return { magnitude: '', direction: '동률' };
  }

  const magnitude = absoluteKm < 1
    ? `${Math.round(absoluteKm * 1000)}m`
    : `${absoluteKm.toFixed(2)}km`;

  return { magnitude, direction: gapKm >= 0 ? '앞' : '뒤' };
}

function buildGapPhrase(gapKm: number): string {
  const { magnitude, direction } = buildCompactDistanceGap(gapKm);
  return direction === '동률' ? '거의 동률' : `${magnitude} ${direction}`;
}

export type DuelGapMessageInput = {
  opponentName: string | null | undefined;
  myPaceLabel: string | null | undefined;
  opponentPaceLabel: string | null | undefined;
  // My distance minus the opponent's, in km.
  gapKm: number | null | undefined;
};

export function buildDuelGapMessage(input: DuelGapMessageInput): LiveGapMessage | null {
  if (typeof input.gapKm !== 'number' || !Number.isFinite(input.gapKm)) {
    // The distance gap is the core of the notification; without it there is nothing
    // meaningful to push yet (opponent progress hasn't synced).
    return null;
  }

  const name = input.opponentName?.trim() || '상대';
  const { magnitude, direction } = buildCompactDistanceGap(input.gapKm);
  const title = direction === '동률'
    ? `${name}와 거의 동률`
    : `${name}보다 ${magnitude} ${direction}`;

  const paceDiff = buildPaceDiffLabel(input.myPaceLabel, input.opponentPaceLabel);
  const myPace = parseMeasuredPaceSecondsPerKm(input.myPaceLabel) === null ? '--:--/km' : String(input.myPaceLabel);
  const opponentPace = parseMeasuredPaceSecondsPerKm(input.opponentPaceLabel) === null ? '--:--/km' : String(input.opponentPaceLabel);
  const paceSuffix = paceDiff ? ` (${paceDiff})` : '';
  const body = `내 페이스 ${myPace} · 상대 ${opponentPace}${paceSuffix}`;

  return { title, body };
}

function resolveTargetParticipant(
  standings: GroupLiveStanding[],
  myIndex: number,
  target: LiveGapGroupTarget,
): GroupLiveStanding | null {
  switch (target) {
    case 'ahead1':
      return standings[myIndex - 1] ?? null;
    case 'ahead2':
      return standings[myIndex - 2] ?? null;
    case 'rank1':
      return standings[0] ?? null;
    case 'rank2':
      return standings[1] ?? null;
    case 'rank3':
      return standings[2] ?? null;
    default:
      return null;
  }
}

const GROUP_TARGET_LABEL = new Map<LiveGapGroupTarget, string>(
  LIVE_GAP_GROUP_TARGET_OPTIONS.map((option) => [option.value, option.label]),
);

export type ResolvedGroupGapTarget = {
  target: LiveGapGroupTarget;
  label: string;
  name: string;
  // My distance minus theirs, in km.
  gapKm: number;
  paceDiff: string | null;
};

function resolveParticipantKey(participant: GroupLiveStanding): string {
  return participant.id ?? participant.name ?? `seed-${participant.seedRank}`;
}

export function resolveGroupGapTargets(
  standings: GroupLiveStanding[],
  selectedTargets: readonly LiveGapGroupTarget[],
  myPaceLabel: string | null | undefined,
): ResolvedGroupGapTarget[] {
  const myIndex = standings.findIndex((standing) => standing.isCurrentUser);

  if (myIndex < 0) {
    return [];
  }

  const me = standings[myIndex];
  const seen = new Set<string>();
  const resolved: ResolvedGroupGapTarget[] = [];

  // Iterate in canonical option order so output reads top-down and stays stable
  // regardless of the order targets were toggled.
  for (const option of LIVE_GAP_GROUP_TARGET_OPTIONS) {
    if (!selectedTargets.includes(option.value)) {
      continue;
    }

    const participant = resolveTargetParticipant(standings, myIndex, option.value);

    if (!participant || participant.isCurrentUser) {
      continue;
    }

    const key = resolveParticipantKey(participant);

    if (seen.has(key)) {
      // e.g. when I sit at rank 2, 'ahead1' and 'rank1' point at the same runner.
      continue;
    }

    seen.add(key);
    resolved.push({
      target: option.value,
      label: GROUP_TARGET_LABEL.get(option.value) ?? option.value,
      name: participant.name?.trim() || '상대',
      gapKm: Number((me.currentDistanceKm - participant.currentDistanceKm).toFixed(2)),
      paceDiff: buildPaceDiffLabel(myPaceLabel, participant.averagePace),
    });
  }

  return resolved;
}

export type GroupGapMessageInput = {
  standings: GroupLiveStanding[];
  selectedTargets: readonly LiveGapGroupTarget[];
  myPaceLabel: string | null | undefined;
};

export function buildGroupGapMessage(input: GroupGapMessageInput): LiveGapMessage | null {
  const myIndex = input.standings.findIndex((standing) => standing.isCurrentUser);

  if (myIndex < 0) {
    return null;
  }

  const resolved = resolveGroupGapTargets(input.standings, input.selectedTargets, input.myPaceLabel);

  if (!resolved.length) {
    return null;
  }

  const myRank = input.standings[myIndex].rank || myIndex + 1;
  const title = `중간 점검 · 현재 ${myRank}위`;
  const body = resolved
    .map((entry) => {
      const gapPhrase = buildGapPhrase(entry.gapKm);
      const pacePart = entry.paceDiff ? `, ${entry.paceDiff}` : '';
      return `${entry.label} ${entry.name}: ${gapPhrase}${pacePart}`;
    })
    .join('\n');

  return { title, body };
}

// --- Spoken (TTS) phrasings: more natural than the compact notification text ---

function buildSpeechDistance(absoluteKm: number): string {
  return absoluteKm < 1
    ? `${Math.round(absoluteKm * 1000)}미터`
    : `${absoluteKm.toFixed(1)}킬로미터`;
}

function withHonorific(name: string): string {
  // The '상대' fallback already reads naturally; only real names take 님.
  return name === '상대' ? name : `${name}님`;
}

// Attach the 와/과 subject particle by whether the (honorific) name ends in a consonant.
// Real names always end in '님' (consonant → 과); the '상대' fallback ends in a vowel (와).
function withWaParticle(honorificName: string): string {
  return `${honorificName}${honorificName.endsWith('님') ? '과' : '와'}`;
}

export function buildPaceDiffSpeech(
  myPaceLabel: string | null | undefined,
  otherPaceLabel: string | null | undefined,
): string | null {
  const mySeconds = parseMeasuredPaceSecondsPerKm(myPaceLabel);
  const otherSeconds = parseMeasuredPaceSecondsPerKm(otherPaceLabel);

  if (mySeconds === null || otherSeconds === null) {
    return null;
  }

  const diff = Math.round(otherSeconds - mySeconds);

  if (Math.abs(diff) < 1) {
    return '페이스는 비슷해요';
  }

  return diff > 0 ? `페이스는 ${diff}초 빨라요` : `페이스는 ${Math.abs(diff)}초 느려요`;
}

export function buildDuelGapSpeech(input: DuelGapMessageInput): string | null {
  if (typeof input.gapKm !== 'number' || !Number.isFinite(input.gapKm)) {
    return null;
  }

  const name = withHonorific(input.opponentName?.trim() || '상대');
  const absoluteKm = Math.abs(input.gapKm);
  const distancePart = absoluteKm < 0.005
    ? `${withWaParticle(name)} 거의 같아요`
    : input.gapKm >= 0
      ? `${name}보다 ${buildSpeechDistance(absoluteKm)} 앞서고 있어요`
      : `${name}보다 ${buildSpeechDistance(absoluteKm)} 뒤처졌어요`;

  const paceSpeech = buildPaceDiffSpeech(input.myPaceLabel, input.opponentPaceLabel);
  return paceSpeech ? `${distancePart}. ${paceSpeech}.` : `${distancePart}.`;
}

export function buildGroupGapSpeech(input: GroupGapMessageInput): string | null {
  const myIndex = input.standings.findIndex((standing) => standing.isCurrentUser);

  if (myIndex < 0) {
    return null;
  }

  const resolved = resolveGroupGapTargets(input.standings, input.selectedTargets, input.myPaceLabel);

  if (!resolved.length) {
    return null;
  }

  const myRank = input.standings[myIndex].rank || myIndex + 1;
  const parts = resolved.map((entry) => {
    const name = withHonorific(entry.name);
    const absoluteKm = Math.abs(entry.gapKm);

    if (absoluteKm < 0.005) {
      return `${entry.label} ${withWaParticle(name)} 거의 같아요`;
    }

    const direction = entry.gapKm >= 0 ? '앞서고 있어요' : '뒤처졌어요';
    return `${entry.label} ${name}보다 ${buildSpeechDistance(absoluteKm)} ${direction}`;
  });

  return `현재 ${myRank}위. ${parts.join('. ')}.`;
}
