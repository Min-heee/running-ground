import { getEstimatedMatchLpDelta } from '@/features/runs/utils/matchScheduling';
import type { RunDetailResponse } from '@/lib/api/types';

type RunRecord = RunDetailResponse['run'];
type MatchResult = NonNullable<RunRecord['matchResult']>;

export type RunMatchResultCardModelInput = {
  matchResult: MatchResult;
  // My own pace/time fallback from the saved run record — used for the '나' column when
  // the matchResult itself didn't persist them (e.g. records saved before the backend
  // accepts the new fields). The opponent's pace/time only come from the matchResult.
  myPaceLabel?: string | null;
  myDurationSeconds?: number | null;
  // Optional overrides for opening the dedicated match-result screen. The card normally
  // reads matchId/mode straight off the matchResult blob (run.matchResult.matchId/.mode);
  // these let the host screen (RunDetailScreen) thread the matchId it was navigated with as
  // a fallback for older records whose blob never persisted matchId.
  matchId?: string | null;
  mode?: 'duel' | 'group' | null;
};

export type RunMatchResultCardModel = {
  resultMatchId: string | null;
  resultMode: 'duel' | 'group' | undefined;
  canOpenResult: boolean;
  myDisplayPaceLabel: string | null;
  myDurationLabel: string | null;
  opponentDurationLabel: string | null;
  lpDelta: number;
  isLpGain: boolean;
  showLp: boolean;
  isParty: boolean;
  typeLabel: string;
  showDuelComparison: boolean;
  gapText: string | null;
  groupRankText: string | null;
};

function formatDurationLabel(durationSeconds?: number) {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }

  const totalSeconds = Math.round(durationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${padded(minutes)}:${padded(seconds)}`;
}

// Pure derivation of everything RunMatchResultCard displays, so the label/LP/link
// logic is unit-testable without rendering.
export function buildRunMatchResultCardModel({
  matchResult,
  myPaceLabel,
  myDurationSeconds,
  matchId,
  mode,
}: RunMatchResultCardModelInput): RunMatchResultCardModel {
  // matchId is persisted on the run record's matchResult JSON blob (run.matchResult.matchId);
  // fall back to the matchId the host screen was navigated with. Trim defensively in case a
  // record stored a padded/empty string.
  const resultMatchId = matchResult.matchId?.trim() || matchId?.trim() || null;
  const resultMode = matchResult.mode ?? mode ?? undefined;
  const canOpenResult = Boolean(resultMatchId);
  const myDisplayPaceLabel = matchResult.myPaceLabel ?? myPaceLabel ?? null;
  const myDisplayDurationSeconds = matchResult.myDurationSeconds
    ?? (typeof myDurationSeconds === 'number' ? myDurationSeconds : undefined);
  const lpDelta = getEstimatedMatchLpDelta(matchResult);
  const isLpGain = lpDelta > 0;
  // A record is a ranked OFFICIAL match only when source === 'official'. Anything else —
  // a party run, OR a record whose source the backend hasn't persisted — is treated as a
  // party run: it shows the 파티런 label and NEVER rank LP (matches getRunKind's split).
  // This is why we gate on 'official' rather than '!== party': a missing source must not
  // leak rank LP onto a party-run record.
  const isOfficial = matchResult.source === 'official';
  const showLp = isOfficial && lpDelta !== 0;
  const isParty = !isOfficial;
  const typeLabel = matchResult.mode === 'duel'
    ? isParty ? '1대1 파티런' : '1대1 대결'
    : isParty ? '그룹 파티런' : '그룹 대결';
  const showDuelComparison = matchResult.mode === 'duel' && Boolean(matchResult.opponentName);
  const gapText = typeof matchResult.gapKm === 'number'
    ? `차이 ${matchResult.gapKm.toFixed(2)}km`
    : null;
  const groupRankText = typeof matchResult.rank === 'number' && typeof matchResult.participantCount === 'number'
    ? `${matchResult.participantCount}명 중 ${matchResult.rank}위`
    : null;

  return {
    resultMatchId,
    resultMode,
    canOpenResult,
    myDisplayPaceLabel,
    myDurationLabel: formatDurationLabel(myDisplayDurationSeconds),
    opponentDurationLabel: formatDurationLabel(matchResult.opponentDurationSeconds),
    lpDelta,
    isLpGain,
    showLp,
    isParty,
    typeLabel,
    showDuelComparison,
    gapText,
    groupRankText,
  };
}
