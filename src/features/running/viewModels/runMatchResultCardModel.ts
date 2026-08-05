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

// ---------------------------------------------------------------------------
// 결과 보드 행 (오너 2026-08-06, 시안 나 확정: 밝은 타워 결) — 1대1은 WIN/LOSE,
// 그룹은 톱3(+내가 밖이면 내 행 추가). 그룹 행은 /result 응답에서 만든다.
// ---------------------------------------------------------------------------

export type MatchBoardRowTone = 'win' | 'lose' | 'draw' | 'rank';

export type MatchBoardRow = {
  key: string;
  leadLabel: string;
  leadTone: MatchBoardRowTone;
  // 그룹 순위 행에서 1·2·3위 금은동 색을 입힐 때 사용 (rank 톤일 때만 의미).
  rankNumber: number | null;
  name: string;
  metricLabel: string | null;
  isMe: boolean;
};

function joinMetric(paceLabel: string | null, durationLabel: string | null): string | null {
  const parts = [paceLabel, durationLabel].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

// 1대1 행: 로컬 matchResult 만으로 만든다 (승자 먼저 — 타워 문법).
export function buildDuelBoardRows(input: {
  matchResult: Pick<MatchResult, 'resultTone' | 'opponentName' | 'opponentPaceLabel'>;
  myDisplayPaceLabel: string | null;
  myDurationLabel: string | null;
  opponentDurationLabel: string | null;
}): MatchBoardRow[] {
  const tone = input.matchResult.resultTone;
  // 판정 전(집계 중)의 tone 부재를 '무'로 보여주면 무승부로 오해한다 — '—' 대기 표기.
  const pendingLabel = '—';
  const myRow: MatchBoardRow = {
    key: 'me',
    leadLabel: tone === 'win' ? 'WIN' : tone === 'lose' ? 'LOSE' : tone === 'draw' ? '무' : pendingLabel,
    leadTone: tone === 'win' ? 'win' : tone === 'lose' ? 'lose' : 'draw',
    rankNumber: null,
    name: '나',
    metricLabel: joinMetric(input.myDisplayPaceLabel, input.myDurationLabel),
    isMe: true,
  };
  const opponentRow: MatchBoardRow = {
    key: 'opponent',
    leadLabel: tone === 'win' ? 'LOSE' : tone === 'lose' ? 'WIN' : tone === 'draw' ? '무' : pendingLabel,
    leadTone: tone === 'win' ? 'lose' : tone === 'lose' ? 'win' : 'draw',
    rankNumber: null,
    name: input.matchResult.opponentName ?? '상대',
    metricLabel: joinMetric(input.matchResult.opponentPaceLabel ?? null, input.opponentDurationLabel),
    isMe: false,
  };
  // 승자 먼저. 무승부/판정 전이면 내가 먼저.
  return tone === 'lose' ? [opponentRow, myRow] : [myRow, opponentRow];
}

export function formatPaceLabelFromSeconds(paceSecondsPerKm: number | null): string | null {
  if (typeof paceSecondsPerKm !== 'number' || !Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0) {
    return null;
  }
  const total = Math.round(paceSecondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`;
}

export const GROUP_BOARD_TOP_COUNT = 3;

type GroupBoardParticipant = {
  name: string;
  paceSecondsPerKm: number | null;
  finishElapsedSeconds: number | null;
  rank: number | null;
  forfeited: boolean;
  isMe: boolean;
};

// 그룹 행: /result 참가자(순위 오름차순)에서 톱3만. 내가 톱3 밖이면 내 행을 끝에
// 덧붙인다 — 내 결과가 안 보이는 기록 화면은 반쪽이라서. 전체 명단은 결과 화면 몫.
export function buildGroupBoardRows(
  participants: readonly GroupBoardParticipant[],
): MatchBoardRow[] {
  const ranked = participants.filter((participant) => typeof participant.rank === 'number');
  const top = ranked.slice(0, GROUP_BOARD_TOP_COUNT);
  const rows = top.map((participant) => toGroupRow(participant));
  const meInTop = top.some((participant) => participant.isMe);
  if (!meInTop) {
    const me = ranked.find((participant) => participant.isMe);
    if (me) {
      rows.push(toGroupRow(me));
    }
  }
  return rows;
}

function toGroupRow(participant: GroupBoardParticipant): MatchBoardRow {
  const durationLabel = formatDurationLabel(participant.finishElapsedSeconds ?? undefined);
  return {
    key: `rank-${participant.rank}-${participant.name}`,
    leadLabel: `${participant.rank}`,
    leadTone: 'rank',
    rankNumber: participant.rank,
    name: participant.isMe ? '나' : participant.name,
    metricLabel: participant.forfeited
      ? '기권'
      : joinMetric(formatPaceLabelFromSeconds(participant.paceSecondsPerKm), durationLabel),
    isMe: participant.isMe,
  };
}

