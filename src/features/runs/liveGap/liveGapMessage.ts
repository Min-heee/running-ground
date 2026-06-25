// Pure builders that turn live-match data into the title/body of a gap push
// notification. No side effects, no expo-notifications import — fully unit-testable.

import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import {
  LIVE_GAP_GROUP_TARGET_OPTIONS,
  type LiveGapGroupTarget,
  type LiveGapMetric,
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

// A background-stale or early-run participant can report a real-but-absurd average pace
// (e.g. '16:48/km' when distance barely accrued while elapsed climbed), which would
// otherwise print as a misleading "평균 16:48/km". Bound the pace so the notification never
// shows an implausible value. Outside these bounds we omit the pace fragment entirely
// (return null) rather than print a garbage number.
//
// 2:30/km (150s) is faster than the world-record marathon pace; 15:00/km (900s) is a slow
// walk — anything beyond that range is a tracking artifact, not a real running pace.
export const MIN_PLAUSIBLE_PACE_SECONDS_PER_KM = 150; // 2:30/km
export const MAX_PLAUSIBLE_PACE_SECONDS_PER_KM = 900; // 15:00/km

function isPlausiblePaceSeconds(seconds: number): boolean {
  return seconds >= MIN_PLAUSIBLE_PACE_SECONDS_PER_KM && seconds <= MAX_PLAUSIBLE_PACE_SECONDS_PER_KM;
}

// The metric is "상대와 평균페이스" — the compared runner's OWN average pace, not a diff
// against me. Returns the runner's measured average pace label (e.g. '5:30/km') only when it
// is a real, plausibly-bounded running pace; otherwise null, so a background-stale garbage
// pace like '16:48/km' yields no pace fragment instead of an absurd "평균 16:48/km".
function plausibleOpponentPaceLabel(paceLabel: string | null | undefined): string | null {
  const seconds = parseMeasuredPaceSecondsPerKm(paceLabel);

  if (seconds === null || !isPlausiblePaceSeconds(seconds)) {
    return null;
  }

  return String(paceLabel).trim();
}

// Notification fragment for the compared runner's average pace, e.g. '평균 5:30/km'.
export function buildOpponentPaceLabel(paceLabel: string | null | undefined): string | null {
  const label = plausibleOpponentPaceLabel(paceLabel);
  return label ? `평균 ${label}` : null;
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

function resolveTargetParticipant(
  standings: GroupLiveStanding[],
  myIndex: number,
  target: LiveGapGroupTarget,
): GroupLiveStanding | null {
  switch (target) {
    case 'ahead1':
      return standings[myIndex - 1] ?? null;
    case 'behind1':
      return standings[myIndex + 1] ?? null;
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
  // The compared runner's OWN average pace, formatted (e.g. '평균 5:30/km'), or null when
  // their pace is unmeasured or implausible.
  paceLabel: string | null;
  paceSpeech: string | null;
};

function resolveParticipantKey(participant: GroupLiveStanding): string {
  return participant.id ?? participant.name ?? `seed-${participant.seedRank}`;
}

export function resolveGroupGapTargets(
  standings: GroupLiveStanding[],
  selectedTargets: readonly LiveGapGroupTarget[],
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
      paceLabel: buildOpponentPaceLabel(participant.averagePace),
      paceSpeech: buildOpponentPaceSpeech(participant.averagePace),
    });
  }

  return resolved;
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

// Spoken fragment for the compared runner's average pace, e.g. '평균 페이스 5분 30초'.
export function buildOpponentPaceSpeech(paceLabel: string | null | undefined): string | null {
  const label = plausibleOpponentPaceLabel(paceLabel);
  return label ? `평균 페이스 ${buildPaceSpeech(label)}` : null;
}

// --- Metric-driven builder: one push assembled from the user's selected metrics ---
// (남은거리 / 평균페이스 / 상대와 거리 / 상대와 평균페이스). Produces both the
// notification (compact, stacked) and the spoken text (natural), so the scheduler can
// deliver either or both depending on the chosen mode.

const PACE_SPEECH_PATTERN = /^(\d{1,2}):(\d{2})\/km$/i;

// '5:30/km' → '5분 30초'. Returns null for unmeasured/placeholder paces so we never
// speak a fake pace.
function buildPaceSpeech(paceLabel: string | null | undefined): string | null {
  const matched = String(paceLabel ?? '').trim().match(PACE_SPEECH_PATTERN);

  if (!matched) {
    return null;
  }

  const minutes = Number(matched[1]);
  const seconds = Number(matched[2]);

  if (minutes === 0 && seconds === 0) {
    return null;
  }

  if (seconds === 0) {
    return `${minutes}분`;
  }

  return minutes === 0 ? `${seconds}초` : `${minutes}분 ${seconds}초`;
}

function formatRemainingDistanceNotif(km: number): string {
  return km < 1
    ? `남은 거리 ${Math.round(km * 1000)}m`
    : `남은 거리 ${km.toFixed(2)}km`;
}

type GapLine = { notif: string; speech: string };

// Combine the selected opponent metrics (distance and/or pace) into one line for a single
// runner. Returns null when neither selected metric has real data yet.
function buildOpponentLine(params: {
  label: string | null;
  name: string;
  gapKm: number | null;
  paceDiffNotif: string | null;
  paceDiffSpeech: string | null;
  wantDistance: boolean;
  wantPace: boolean;
}): GapLine | null {
  const honorific = withHonorific(params.name);
  const labelPrefixNotif = params.label ? `${params.label} ${params.name}: ` : `${params.name} `;
  const labelPrefixSpeech = params.label ? `${params.label} ` : '';

  const notifParts: string[] = [];
  const speechParts: string[] = [];

  if (params.wantDistance && typeof params.gapKm === 'number' && Number.isFinite(params.gapKm)) {
    const { magnitude, direction } = buildCompactDistanceGap(params.gapKm);
    const absoluteKm = Math.abs(params.gapKm);

    if (direction === '동률') {
      notifParts.push('거의 동률');
      speechParts.push(`${labelPrefixSpeech}${withWaParticle(honorific)} 거의 같아요`);
    } else {
      notifParts.push(`${magnitude} ${direction}`);
      const phrase = direction === '앞' ? '앞서고 있어요' : '뒤처졌어요';
      speechParts.push(`${labelPrefixSpeech}${honorific}보다 ${buildSpeechDistance(absoluteKm)} ${phrase}`);
    }
  }

  if (params.wantPace && params.paceDiffNotif) {
    notifParts.push(params.paceDiffNotif);
  }
  if (params.wantPace && params.paceDiffSpeech) {
    // When distance was already spoken the label is consumed; otherwise lead with it.
    speechParts.push(speechParts.length ? params.paceDiffSpeech : `${labelPrefixSpeech}${params.paceDiffSpeech}`);
  }

  if (!notifParts.length && !speechParts.length) {
    return null;
  }

  return {
    notif: `${labelPrefixNotif}${notifParts.join(', ')}`,
    speech: speechParts.join('. '),
  };
}

export type LiveGapOutput = {
  notification: LiveGapMessage | null;
  speech: string | null;
};

export type LiveGapOutputInput = {
  matchMode: 'duel' | 'group';
  metrics: readonly LiveGapMetric[];
  // My metrics (apply to both modes).
  remainingDistanceKm?: number | null;
  avgPaceLabel?: string | null;
  // Duel opponent.
  opponentName?: string | null;
  // My distance minus the opponent's, in km.
  opponentGapKm?: number | null;
  opponentPaceLabel?: string | null;
  // Group.
  standings?: GroupLiveStanding[];
  groupTargets?: readonly LiveGapGroupTarget[];
  // When MY live distance is stale (screen-off JS freeze: distance frozen while elapsed climbs),
  // every metric DERIVED FROM MY DISTANCE is a lie and must be withheld this interval: the
  // ballooned avg pace AND the my-vs-opponent gap (a frozen checkpoint vs. the opponent's
  // still-advancing server poll prints a phantom "40m 뒤"). Opponent-only metrics (their distance
  // is fed in pre-gapped, their pace) are unaffected. Detected by timestamp, never by pace
  // magnitude — see isMyMatchDistanceStale.
  isMyDistanceStale?: boolean;
};

export function buildLiveGapOutput(input: LiveGapOutputInput): LiveGapOutput {
  const wants = (metric: LiveGapMetric) => input.metrics.includes(metric);
  const isMyDistanceStale = input.isMyDistanceStale === true;
  const lines: GapLine[] = [];

  // --- My metrics ---
  if (wants('remainingDistance')
    && typeof input.remainingDistanceKm === 'number'
    && Number.isFinite(input.remainingDistanceKm)) {
    const km = Math.max(0, input.remainingDistanceKm);
    lines.push({
      notif: formatRemainingDistanceNotif(km),
      speech: `남은 거리 ${buildSpeechDistance(km)}`,
    });
  }

  // avgPace is MY cumulative average (elapsed/distance) — when my distance is frozen the
  // denominator is stale and this balloons, so withhold it while stale rather than print a lie.
  if (!isMyDistanceStale && wants('avgPace') && parseMeasuredPaceSecondsPerKm(input.avgPaceLabel) !== null) {
    lines.push({
      notif: `평균 ${String(input.avgPaceLabel)}`,
      speech: `평균 페이스 ${buildPaceSpeech(input.avgPaceLabel)}`,
    });
  }

  // --- Opponent metrics ---
  const wantOppDistance = wants('opponentDistance');
  const wantOppPace = wants('opponentPace');

  if (wantOppDistance || wantOppPace) {
    if (input.matchMode === 'duel') {
      // The duel gap is MY distance minus the opponent's; when mine is stale the gap is a
      // phantom, so drop the distance fragment (gapKm = null) but keep the opponent's own pace.
      const gapKm = !isMyDistanceStale
        && typeof input.opponentGapKm === 'number'
        && Number.isFinite(input.opponentGapKm)
        ? input.opponentGapKm
        : null;
      const line = buildOpponentLine({
        label: null,
        name: input.opponentName?.trim() || '상대',
        gapKm,
        paceDiffNotif: buildOpponentPaceLabel(input.opponentPaceLabel),
        paceDiffSpeech: buildOpponentPaceSpeech(input.opponentPaceLabel),
        wantDistance: wantOppDistance,
        wantPace: wantOppPace,
      });
      if (line) {
        lines.push(line);
      }
    } else {
      const resolved = resolveGroupGapTargets(
        input.standings ?? [],
        input.groupTargets ?? [],
      );
      for (const entry of resolved) {
        const line = buildOpponentLine({
          label: entry.label,
          name: entry.name,
          // entry.gapKm is me.currentDistanceKm minus theirs — phantom while my distance is
          // stale, so suppress the distance fragment but keep the opponent's own pace.
          gapKm: isMyDistanceStale ? null : entry.gapKm,
          paceDiffNotif: entry.paceLabel,
          paceDiffSpeech: entry.paceSpeech,
          wantDistance: wantOppDistance,
          wantPace: wantOppPace,
        });
        if (line) {
          lines.push(line);
        }
      }
    }
  }

  if (!lines.length) {
    // Nothing to say yet (data not ready, or every selected metric is unmeasured).
    return { notification: null, speech: null };
  }

  let title = '대결 중간 점검';
  if (input.matchMode === 'group') {
    const standings = input.standings ?? [];
    const myIndex = standings.findIndex((standing) => standing.isCurrentUser);
    if (myIndex >= 0) {
      const myRank = standings[myIndex].rank || myIndex + 1;
      title = `중간 점검 · 현재 ${myRank}위`;
    } else {
      title = '중간 점검';
    }
  }

  const notification: LiveGapMessage = {
    title,
    body: lines.map((line) => line.notif).join('\n'),
  };
  const speech = `${lines.map((line) => line.speech).join('. ')}.`;

  return { notification, speech };
}
