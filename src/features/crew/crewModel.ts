// 크루대전 표시 모델 — RN 무의존 순수 함수 (node 테스트 러너 호환).
//
// 규칙의 주인은 서버다(backend/src/lib/crew/crewConstants.mjs). 여기 상수는 화면 문구와 입력
// 즉시 검증에 쓰는 **거울**일 뿐이라, 서버가 거절하면 서버 코드(ApiError.details.code)가 이긴다.
// 에러 코드 → 한국어 문구는 이 파일 한 곳에서만 매긴다 (오너 2026-09-18 스펙): 화면마다 따로
// 쓰면 같은 거절이 화면마다 다른 말로 나온다.

import type {
  CrewMemberRow,
  CrewSeasonInfo,
  CrewStandingRow,
  CrewUnrankedReason,
} from '@/lib/api/types/crew';
import { getApiErrorMessage } from '@/services/apiError';

export const CREW_MAX_MEMBERS = 30;
export const CREW_JOINS_PER_MONTH = 3;
export const CREW_NAME_MIN_LENGTH = 2;
export const CREW_NAME_MAX_LENGTH = 12;
export const CREW_INVITE_CODE_LENGTH = 6;
export const CREW_KICK_BAN_DAYS = 30;
export const CREW_CREATE_COOLDOWN_DAYS = 30;
export const CREW_REQUEST_TTL_DAYS = 7;
// 같은 크루에 다시 신청하기까지: 취소 뒤 하루, 거절 뒤 7일 (서버 request_cooldown, 2026-09-18).
export const CREW_REQUEST_REJECT_COOLDOWN_DAYS = 7;
export const CREW_NEWCOMER_DAYS = 7;
// 보정 인당의 K — 서버는 universeBodies.mjs의 SHRINKAGE_PRIOR_MEMBERS를 import한다. 설명 문구용 거울.
export const CREW_SHRINKAGE_MEMBERS = 5;
// 순위에 오르는 최소 시즌 멤버 수.
export const CREW_MIN_RANKED_MEMBERS = 3;
// 순위에 오른 크루가 이보다 적으면 빈 순위표 대신 '크루 모집 중'을 보여준다 (심사 must-fix: 콜드스타트).
export const CREW_BOARD_MIN_RANKED_CREWS = 3;
// 크루 탭 순위 카드는 5개까지 — 나머지는 '전체 순위 ›'에서 (친구 순위표 5명 + 더보기와 같은 결).
export const CREW_BOARD_PREVIEW_LIMIT = 5;
// 초대 링크 — 마이 탭 태그 공유와 같은 우리 도메인 리다이렉트(GET /download). 앱 설치자는
// ?crew= 스마트 랜딩에서 runningground://crew-join?code= 로 넘어가고, 미설치자는 스토어로 간다.
export const CREW_INVITE_LINK_BASE = 'https://api.running-ground.com/download';

// publicTag와 같은 32자 알파벳 — 헷갈리는 I, O, 0, 1은 없다.
const CREW_INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
// 한글 음절·영문·숫자 낱말을 띄어쓰기 한 칸으로만 잇는다.
const CREW_NAME_PATTERN = /^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// --- 에러 코드 → 문구 ---

export type CrewErrorCode =
  | 'crew_full'
  | 'join_limit'
  | 'create_limit'
  | 'invalid_name'
  | 'blocked_name'
  | 'name_taken'
  | 'crew_banned'
  | 'not_found'
  | 'not_captain'
  | 'not_member'
  | 'already_in_crew'
  | 'request_pending'
  | 'request_cooldown';

// 'decide' = 캡틴이 가입 신청을 승인·거절할 때. 승인은 가입과 같은 검사를 타므로 같은 코드가
// 돌아오는데, 그때 주어는 내가 아니라 신청한 사람이다 — 같은 문구를 쓰면 캡틴에게 '이미 크루에
// 들어가 있어요'라고 말하게 된다.
export type CrewErrorContext = 'self' | 'decide';

const CREW_ERROR_COPY: Record<CrewErrorCode, string> = {
  crew_full: `인원이 꽉 찼어요. 크루는 ${CREW_MAX_MEMBERS}명까지 함께할 수 있어요.`,
  join_limit: `이번 달 크루 이동 ${CREW_JOINS_PER_MONTH}번을 다 썼어요. 다음 달 1일부터 다시 들어갈 수 있어요.`,
  create_limit: `크루는 ${CREW_CREATE_COOLDOWN_DAYS}일에 한 번만 만들 수 있어요.`,
  invalid_name: `이름은 ${CREW_NAME_MIN_LENGTH}~${CREW_NAME_MAX_LENGTH}자, 한글·영문·숫자로 지어 주세요.`,
  blocked_name: '쓸 수 없는 단어가 들어 있어요. 다른 이름으로 지어 주세요.',
  name_taken: '이미 있는 이름이에요. 다른 이름으로 지어 주세요.',
  crew_banned: `이 크루에는 ${CREW_KICK_BAN_DAYS}일 동안 다시 들어갈 수 없어요.`,
  not_found: '크루를 찾지 못했어요. 코드가 바뀌었거나 크루가 닫혔을 수 있어요.',
  not_captain: '캡틴만 할 수 있어요.',
  not_member: '이 크루의 멤버가 아니에요.',
  already_in_crew: '이미 크루에 들어가 있어요. 지금 크루를 나가야 다른 크루에 들어갈 수 있어요.',
  request_pending: '보내 둔 가입 신청이 있어요. 그 신청을 취소해야 새로 보낼 수 있어요.',
  request_cooldown: `이 크루에는 조금 뒤에 다시 신청할 수 있어요. 신청을 취소하면 하루, 거절되면 ${CREW_REQUEST_REJECT_COOLDOWN_DAYS}일 뒤에 다시 보낼 수 있어요.`,
};

const CREW_DECIDE_ERROR_COPY: Partial<Record<CrewErrorCode, string>> = {
  already_in_crew: '신청한 분이 그새 다른 크루에 들어가서 신청이 없어졌어요.',
  join_limit: `신청한 분이 이번 달 크루 이동 ${CREW_JOINS_PER_MONTH}번을 다 써서 지금은 받을 수 없어요.`,
  crew_banned: `내보낸 지 ${CREW_KICK_BAN_DAYS}일이 안 된 분이라 지금은 받을 수 없어요.`,
  not_found: `신청이 취소됐거나 ${CREW_REQUEST_TTL_DAYS}일이 지나 사라졌어요.`,
};

const CREW_ERROR_CODE_SET = new Set<string>(Object.keys(CREW_ERROR_COPY));

function readStringCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

// 서버 sendError는 details.code를 본문 최상위 code로도 올려 보낸다. 클라이언트 ApiError.details는
// 그 본문 전체라, 최상위 code를 먼저 보고 없으면 안쪽 details.code를 본다.
export function getCrewErrorCode(error: unknown): CrewErrorCode | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const details = (error as { details?: unknown }).details;
  const code = readStringCode(details)
    ?? readStringCode((details as { details?: unknown } | null | undefined)?.details);

  return code && CREW_ERROR_CODE_SET.has(code) ? code as CrewErrorCode : null;
}

export function getCrewErrorMessage(
  error: unknown,
  fallbackMessage: string,
  context: CrewErrorContext = 'self',
): string {
  const code = getCrewErrorCode(error);

  if (code) {
    return (context === 'decide' ? CREW_DECIDE_ERROR_COPY[code] : undefined) ?? CREW_ERROR_COPY[code];
  }

  // 모르는 코드(레이트 리밋 등)는 서버 문구를 그대로 — 서버가 이미 사람 말로 보낸다.
  return getApiErrorMessage(error, fallbackMessage);
}

// 화면이 들고 있는 크루 상태가 서버와 어긋났다는 거절 — 그새 내보내졌거나(not_member), 캡틴이
// 넘어갔거나(not_captain), 크루·신청이 사라졌다(not_found). 문구만 띄우고 두면 낡은 크루 화면이
// 탭을 다시 열 때까지 남으니 홈을 다시 부른다 (적대 리뷰 2026-09-18).
const CREW_STATE_DRIFT_CODES = new Set<CrewErrorCode>(['not_found', 'not_member', 'not_captain', 'already_in_crew']);

export function isCrewStateDriftError(error: unknown): boolean {
  const code = getCrewErrorCode(error);
  return code !== null && CREW_STATE_DRIFT_CODES.has(code);
}

// --- 크루 이름 (입력 즉시 검증 — 금칙어·중복은 서버만 안다) ---

export type CrewNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too_short' | 'too_long' | 'invalid_chars'; message: string };

export function checkCrewName(raw: string): CrewNameCheck {
  const name = raw.trim();
  const length = Array.from(name).length;

  if (length === 0) {
    return { ok: false, reason: 'empty', message: `${CREW_NAME_MIN_LENGTH}~${CREW_NAME_MAX_LENGTH}자로 지어 주세요.` };
  }

  if (length < CREW_NAME_MIN_LENGTH) {
    return { ok: false, reason: 'too_short', message: `${CREW_NAME_MIN_LENGTH}자 이상으로 지어 주세요.` };
  }

  if (length > CREW_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too_long', message: `${CREW_NAME_MAX_LENGTH}자까지 쓸 수 있어요.` };
  }

  if (!CREW_NAME_PATTERN.test(name)) {
    return { ok: false, reason: 'invalid_chars', message: '한글·영문·숫자와 띄어쓰기 한 칸만 쓸 수 있어요.' };
  }

  return { ok: true, name };
}

// --- 초대 코드 ---

// 소문자·공백·하이픈을 걷어 대문자 6자로. 초대 링크(…/download?crew=ABC23K)를 통째로 붙여
// 넣어도 코드만 뽑는다 — 카톡에서 링크째 복사해 오는 게 가장 흔한 경로다.
export function normalizeCrewInviteCode(raw: string): string {
  const fromLink = /[?&]crew=([A-Za-z0-9]+)/.exec(raw);
  const source = fromLink ? fromLink[1] : raw;
  return source.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CREW_INVITE_CODE_LENGTH);
}

export function isValidCrewInviteCode(code: string): boolean {
  return CREW_INVITE_CODE_PATTERN.test(code);
}

// 코드 입력 아래 한 줄. null이면 아무것도 안 띄운다(유효한 코드 → 미리보기가 말한다).
export function describeCrewInviteCodeInput(code: string): { tone: 'hint' | 'error'; text: string } | null {
  if (code.length === 0) {
    return { tone: 'hint', text: '캡틴에게 받은 6자리 코드를 넣어 주세요.' };
  }

  if (code.length < CREW_INVITE_CODE_LENGTH) {
    return { tone: 'hint', text: `${code.length}/${CREW_INVITE_CODE_LENGTH}` };
  }

  if (!isValidCrewInviteCode(code)) {
    return { tone: 'error', text: '코드에는 I·O·0·1이 들어가지 않아요. 다시 확인해 주세요.' };
  }

  return null;
}

export function buildCrewInviteShareMessage(crewName: string, inviteCode: string): string {
  return `러닝그라운드 크루 '${crewName}'에 같이 들어와요. 초대 코드: ${inviteCode}\n`
    + `앱에서 바로 가입: ${CREW_INVITE_LINK_BASE}?crew=${inviteCode}`;
}

// --- 숫자 표시 ---

function roundKm(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

// 보정 인당은 늘 소수 둘째 자리까지 — 순위를 가르는 값이라 60과 60.00이 한 열에 섞이면 안 된다.
export function formatCrewScore(score: number): string {
  return roundKm(score).toFixed(2);
}

// '보정 인당 66.25km' — 보정 전 인당 평균은 어디에도 보여주지 않는다 (심사 must-fix: '평균이
// 더 높은데 왜 아래지?' 모순 차단). 순위표·히어로의 큰 숫자는 이 값 하나뿐이다.
export function formatCrewScoreLine(score: number): string {
  return `보정 인당 ${formatCrewScore(score)}km`;
}

// 기여·총거리 km — 서버 roundDistanceKm(소수 2자리, 2026-08-15 거리 정밀도 단일 근원)이 준 값을
// 그대로 찍는다: 121.2는 121.2, 8.15는 8.15, 42는 42 (뒤꼬리 0을 붙이지 않는다 — 친구 순위 행과 같은 결).
export function formatCrewKm(km: number): string {
  return String(roundKm(km));
}

// (T + K·P) ÷ (N + K) — 설명 카드 예시용 거울. 실제 순위는 서버가 같은 식으로 매긴다.
export function computeCrewScore(totalKm: number, seasonMemberCount: number, priorKm: number): number {
  const members = Math.max(0, seasonMemberCount);
  return roundKm((totalKm + CREW_SHRINKAGE_MEMBERS * priorKm) / (members + CREW_SHRINKAGE_MEMBERS));
}

export function formatCrewNameWithStars(name: string, stars: number): string {
  return stars > 0 ? `${name} ★${stars}` : name;
}

// --- 순위 ---

export function formatCrewRank(rank: number | null): string {
  return typeof rank === 'number' && rank > 0 ? `${rank}위` : '순위 밖';
}

export function isCrewPodiumRank(rank: number | null): boolean {
  return typeof rank === 'number' && rank >= 1 && rank <= 3;
}

export function isCrewBoardOpen(rankedCrewCount: number): boolean {
  return rankedCrewCount >= CREW_BOARD_MIN_RANKED_CREWS;
}

// 전체 순위의 '순위 밖' 행 옆 한 단어.
export const CREW_UNRANKED_SHORT_LABELS: Record<CrewUnrankedReason, string> = {
  too_few_members: '3명 미만',
  no_distance: '기록 없음',
  newcomers_pending: '합류 대기',
};

export function formatCrewUnrankedShort(reason: CrewUnrankedReason | null): string {
  return reason ? CREW_UNRANKED_SHORT_LABELS[reason] : '순위 밖';
}

function toKstParts(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

// ISO → KST '10/9'. 못 읽는 값이면 null (행에서 태그를 통째로 뺀다).
export function formatCrewMonthDay(iso: string | null | undefined): string | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;

  if (!Number.isFinite(ms)) {
    return null;
  }

  const { month, day } = toKstParts(ms);
  return `${month}/${day}`;
}

// ISO → KST '10/3 0시' (봉인 시각 안내).
export function formatCrewMonthDayHour(iso: string | null | undefined): string | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;

  if (!Number.isFinite(ms)) {
    return null;
  }

  const { month, day, hour } = toKstParts(ms);
  return `${month}/${day} ${hour}시`;
}

// 멤버 행의 회색 '10/9 합류' — 그날부터 이 멤버가 크루 점수(인원수와 거리)에 들어간다.
// countedFrom(7일 규칙)이 먼저고, 이미 셈에 든 멤버라도 기록 인정(countsFrom = 정규 시즌은 가입
// 다음 날 0시, 프리시즌은 가입 순간)이 아직이면 그 날짜를 보인다. 둘 다 지났으면 태그 없음.
// 1분 여유: 프리시즌 countsFrom은 서버 시계의 '지금'이라, 폰 시계가 몇 초 늦으면 방금 들어온
// 사람에게 '오늘 합류' 태그가 붙는다(적대 리뷰 2026-09-18). 정규 시즌 값은 0시라 잃는 게 없다.
const CREW_CLOCK_SKEW_TOLERANCE_MS = 60_000;

export function formatCrewMemberJoinTag(member: CrewMemberRow, nowMs: number): string | null {
  const countedFromMs = member.countedFrom ? Date.parse(member.countedFrom) : Number.NaN;
  const skewedNowMs = nowMs + CREW_CLOCK_SKEW_TOLERANCE_MS;

  if (Number.isFinite(countedFromMs) && countedFromMs > skewedNowMs) {
    const label = formatCrewMonthDay(member.countedFrom);
    return label ? `${label} 합류` : null;
  }

  const countsFromMs = Date.parse(member.countsFrom);

  if (Number.isFinite(countsFromMs) && countsFromMs > skewedNowMs) {
    const label = formatCrewMonthDay(member.countsFrom);
    return label ? `${label} 합류` : null;
  }

  return null;
}

export function isCrewMemberPending(member: CrewMemberRow, nowMs: number): boolean {
  return formatCrewMemberJoinTag(member, nowMs) !== null;
}

// 기여 큰 순, 같으면 이름 순. 서버 순서(가입 순일 수 있다)에 기대지 않는다.
export function sortCrewMembersForDisplay(members: readonly CrewMemberRow[]): CrewMemberRow[] {
  return [...members].sort((left, right) => (
    right.contributionKm - left.contributionKm || left.name.localeCompare(right.name, 'ko')
  ));
}

// 신입 합류를 기다리는 크루가 순위에 오르는 날 — 시즌 멤버가 3명이 되는 날짜.
// 이미 센 인원은 서버 순위의 seasonMemberCount를 쓴다 (적대 리뷰 2026-09-18): 7일을 채우고 나간
// 멤버도 이번 시즌 N에 남는데 members[]는 지금 멤버뿐이라, 거기서 세면 날짜가 늦거나 안 나온다.
// seasonMemberCount를 못 받았을 때만 지금 멤버 중 이미 센 사람으로 가늠한다.
export function resolveCrewRankedFromDate(
  members: readonly CrewMemberRow[],
  seasonMemberCount?: number,
): string | null {
  const countedCount = typeof seasonMemberCount === 'number' && Number.isFinite(seasonMemberCount)
    ? seasonMemberCount
    : members.filter((member) => member.countedFrom === null).length;

  if (countedCount >= CREW_MIN_RANKED_MEMBERS) {
    return null;
  }

  const pending = members
    .map((member) => member.countedFrom)
    .filter((iso): iso is string => typeof iso === 'string' && Number.isFinite(Date.parse(iso)))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const needed = CREW_MIN_RANKED_MEMBERS - countedCount;

  return pending.length >= needed ? pending[needed - 1] : null;
}

// 히어로 '순위 밖' 아래 한 줄. seasonMemberCount = 그 크루 순위 행의 seasonMemberCount.
export function describeCrewUnranked(
  reason: CrewUnrankedReason | null,
  members: readonly CrewMemberRow[] = [],
  seasonMemberCount?: number,
): string {
  if (reason === 'newcomers_pending') {
    const label = formatCrewMonthDay(resolveCrewRankedFromDate(members, seasonMemberCount));
    return label ? `${label}부터 순위에 올라요` : '새 멤버가 합류하면 순위에 올라요';
  }

  if (reason === 'no_distance') {
    return '멤버가 달리면 순위에 올라요';
  }

  return `시즌 멤버가 ${CREW_MIN_RANKED_MEMBERS}명이 되면 순위에 올라요`;
}

// 두 보정 인당의 차이 — 반올림된 두 값을 빼고 다시 반올림(부동소수 꼬리 제거).
export function formatCrewScoreGap(higherScore: number, lowerScore: number): string {
  return formatCrewScore(Math.max(0, roundKm(higherScore) - roundKm(lowerScore)));
}

// 히어로 메타의 뒷부분. 1위가 아니면 '1위와 4.25km 차이', 1위면 바로 아래 순위와의 차이,
// 공동 1위면 '공동 1위'. 순위 밖이면 null (그 자리는 describeCrewUnranked가 맡는다).
export function buildCrewGapLine(standing: CrewStandingRow, top: readonly CrewStandingRow[]): string | null {
  if (standing.rank === null) {
    return null;
  }

  if (standing.rank > 1) {
    const leader = top.find((row) => row.rank === 1);
    return leader ? `1위와 ${formatCrewScoreGap(leader.score, standing.score)}km 차이` : null;
  }

  const coLeaders = top.filter((row) => row.rank === 1 && row.crewId !== standing.crewId);

  if (coLeaders.length > 0) {
    return '공동 1위';
  }

  const runnerUp = top.find((row) => row.rank !== null && row.rank > 1);
  return runnerUp ? `${runnerUp.rank}위와 ${formatCrewScoreGap(standing.score, runnerUp.score)}km 차이` : null;
}

// 히어로 메타 한 줄: '보정 인당 66.25km · 1위와 4.25km 차이'.
export function buildCrewHeroMeta(standing: CrewStandingRow, top: readonly CrewStandingRow[]): string {
  return [formatCrewScoreLine(standing.score), buildCrewGapLine(standing, top)].filter(Boolean).join(' · ');
}

// --- 시즌 ---

export function formatCrewSeasonMonth(seasonKey: string): string {
  const month = Number(seasonKey.split('-')[1]);
  return Number.isFinite(month) && month >= 1 ? `${month}월` : seasonKey;
}

export function shiftCrewSeasonKey(seasonKey: string, deltaMonths: number): string {
  const [year, month] = seasonKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

// 시즌 진행 한 마디: '12일 남음' / 마지막 날 '오늘 끝나요' / 봉인 전 1시간 '집계 중 · 10/1 1시 확정' / '확정'.
export function buildCrewSeasonProgressLabel(season: CrewSeasonInfo): string {
  if (season.status === 'tallying') {
    const sealsAt = formatCrewMonthDayHour(season.sealsAt);
    return sealsAt ? `집계 중 · ${sealsAt} 확정` : '집계 중';
  }

  if (season.status === 'sealed') {
    return '확정';
  }

  return season.daysLeft > 0 ? `${season.daysLeft}일 남음` : '오늘 끝나요';
}

// '9월 프리시즌 · 12일 남음'.
export function buildCrewSeasonStatusLine(season: CrewSeasonInfo): string {
  return `${season.label} · ${buildCrewSeasonProgressLabel(season)}`;
}

// 별을 주는 첫 시즌 — 프리시즌이 9·10월 두 달이라(오너 2026-09-18 연장) '다음 달'로 짐작하면 9월에
// '별은 10월부터'라고 틀린다. 서버 값을 쓰고, 필드가 없는 구 백엔드(프리시즌 9월 한 달)면 그 서버의
// 뜻 그대로 다음 달이다(적대 리뷰 2026-09-18: 없는 값을 그대로 쓰면 split에서 크루 탭이 죽는다).
export function resolveCrewFirstStarSeasonKey(season: CrewSeasonInfo): string {
  return season.firstStarSeasonKey ?? shiftCrewSeasonKey(season.seasonKey, 1);
}

// 이전 시즌이 없는 첫 시즌인지 — 구 백엔드는 프리시즌 = 첫 시즌(9월 한 달)이었다.
export function isCrewFirstSeason(season: CrewSeasonInfo): boolean {
  return season.isFirstSeason ?? season.isPreseason;
}

// 프리시즌은 순위만 돌고 별은 첫 별 시즌부터 — 크루가 없을 때 히어로 아래 한 줄로 미리 말해 둔다.
export function buildCrewPreseasonNote(season: CrewSeasonInfo): string | null {
  if (!season.isPreseason) {
    return null;
  }

  return `프리시즌이에요 · 별은 ${formatCrewSeasonMonth(resolveCrewFirstStarSeasonKey(season))} 시즌부터 받아요`;
}

// 내 크루 히어로 맨 아래 작은 한 줄: 시즌이 언제 끝나는지, 프리시즌이면 별이 언제부터인지까지.
// 히어로 줄 수를 늘리지 않으려고 한 줄에 접는다.
export function buildCrewHeroSeasonNote(season: CrewSeasonInfo): string {
  if (season.status === 'live' && season.isPreseason) {
    const starsFrom = formatCrewSeasonMonth(resolveCrewFirstStarSeasonKey(season));
    return `프리시즌 · ${buildCrewSeasonProgressLabel(season)} · 별은 ${starsFrom} 시즌부터`;
  }

  return buildCrewSeasonStatusLine(season);
}

// 시즌 순위표를 (다시) 부를지 — useCrewLeague의 판단 (RN 없이 테스트하려고 여기 둔다).
// cached: 'none' = 아직 없음, 'sealed' = 봉인 스냅샷(영구히 맞다), 'unsealed' = 진행 중·집계 중
// 응답(낡는다), 'other' = 불러오는 중·에러·없는 시즌(에러는 '다시 불러오기'가 맡는다).
// 봉인 전 응답은 조회가 다시 켜질 때(세그먼트 재진입)나 refreshKey가 바뀔 때 다시 부른다
// (적대 리뷰 2026-09-18: 한 번 받은 '집계 중'을 앱을 끌 때까지 들고 있어 우승 발표가 안 보였다).
export function shouldFetchCrewLeague({
  enabled,
  cached,
  wasEnabled,
  refreshKeyChanged,
}: {
  enabled: boolean;
  cached: 'none' | 'sealed' | 'unsealed' | 'other';
  wasEnabled: boolean;
  refreshKeyChanged: boolean;
}): boolean {
  if (!enabled) {
    return false;
  }

  if (cached === 'none') {
    return true;
  }

  return cached === 'unsealed' && (!wasEnabled || refreshKeyChanged);
}

// 지난 시즌 머리 한 줄. 우승은 순위만으로 못 정한다(뛴 멤버 3명 등) — 챔피언 목록은 서버 원장
// (home.lastSeason)에서 받은 것만 쓴다.
export function buildCrewLastSeasonHeadline({
  season,
  sealed,
  champions,
}: {
  season: CrewSeasonInfo;
  sealed: boolean;
  champions: readonly { name: string }[];
}): string {
  // 봉인 전 1시간 — 지난 시즌은 끝났으니 '집계 중'뿐이다.
  if (!sealed) {
    const sealsAt = formatCrewMonthDayHour(season.sealsAt);
    return sealsAt ? `${season.label} · 집계 중 · ${sealsAt} 확정` : `${season.label} · 집계 중`;
  }

  if (season.isPreseason) {
    return `${season.label} · 별 없이 순위만 남겼어요`;
  }

  if (champions.length === 0) {
    return `${season.label} · 우승 크루가 없었어요`;
  }

  const names = champions.map((champion) => `${champion.name} ★`).join(', ');
  return champions.length > 1 ? `${season.label} 공동 우승 · ${names}` : `${season.label} 우승 · ${names}`;
}

// --- 확인 문구 (Alert) ---

// 이번 가입(또는 만들기)을 쓰고 남는 이동 횟수 한 문장. 횟수를 못 받았으면(null) 말하지 않는다 —
// 모르는 채로 '더 옮길 수 없어요'라고 겁주지 않는다.
function describeJoinsLeftAfterUse(joinsLeftThisMonth: number | null): string | null {
  if (joinsLeftThisMonth === null) {
    return null;
  }

  const leftAfterUse = Math.max(0, joinsLeftThisMonth - 1);
  return leftAfterUse > 0 ? `이번 달엔 크루를 ${leftAfterUse}번 더 옮길 수 있어요.` : '이번 달엔 크루를 더 옮길 수 없어요.';
}

// 기록이 언제부터 크루 점수에 들어가는지 — 서버 pushMembershipRow와 같은 규칙: 정규 시즌은 다음 날
// 0시, 프리시즌은 들어온 순간부터 (오너 2026-09-18 '가입한 날 바로').
export function describeCrewCountsStart(isPreseason: boolean): string {
  return isPreseason ? '들어온 순간부터 기록이 크루 점수에 들어가요' : '내일 0시부터 기록이 크루 점수에 들어가요';
}

// 가입 확인 (오너 스펙 문구). N은 이번 가입을 쓰고 남는 횟수다.
// isPreseason null = 아직 크루 정보를 못 받음 — 모르는 채로 '내일 0시부터'라고 단정하지 않는다.
export function buildCrewJoinConfirmMessage(
  joinsLeftThisMonth: number | null,
  hasPendingRequest = false,
  isPreseason: boolean | null = false,
): string {
  return [
    isPreseason === null ? null : `${describeCrewCountsStart(isPreseason)}.`,
    describeJoinsLeftAfterUse(joinsLeftThisMonth),
    hasPendingRequest ? '보내 둔 가입 신청은 취소돼요.' : null,
  ].filter(Boolean).join(' ');
}

// 만들기도 이번 달 크루 이동 한 번으로 센다 (오너 스펙: 코드 가입·승인·만들기 모두 월 3회에 포함).
// 만들면 서버가 보내 둔 가입 신청을 취소한다 — 코드 가입 확인과 같은 문장으로 미리 말한다
// (적대 리뷰 2026-09-18: 만들기만 말없이 신청을 없애고 있었다).
export function buildCrewCreateConfirmMessage(
  joinsLeftThisMonth: number | null,
  hasPendingRequest = false,
  isPreseason: boolean | null = false,
): string {
  return [
    `크루는 ${CREW_CREATE_COOLDOWN_DAYS}일에 한 번만 만들 수 있어요.`,
    isPreseason === null ? null : `${describeCrewCountsStart(isPreseason)}.`,
    describeJoinsLeftAfterUse(joinsLeftThisMonth),
    hasPendingRequest ? '보내 둔 가입 신청은 취소돼요.' : null,
  ].filter(Boolean).join(' ');
}

export function buildCrewRequestConfirmMessage(crewName: string): string {
  return `${crewName} 캡틴이 승인하면 들어가요. 신청은 ${CREW_REQUEST_TTL_DAYS}일 동안 유효하고, 한 번에 한 크루에만 보낼 수 있어요.`;
}

// 신청 취소 확인 — 취소하면 그 크루엔 하루 동안 다시 못 보낸다(서버 request_cooldown).
export function buildCrewCancelRequestConfirmMessage(crewName: string): string {
  return `${crewName}에 보낸 가입 신청을 취소할까요? 취소하면 이 크루에는 하루 뒤에 다시 신청할 수 있어요.`;
}

export function buildCrewLeaveConfirmMessage({
  joinsLeftThisMonth,
  isCaptain,
  memberCount,
}: {
  joinsLeftThisMonth: number;
  isCaptain: boolean;
  memberCount: number;
}): string {
  return [
    '나가는 순간부터 기록이 크루 점수에 들어가지 않아요.',
    memberCount <= 1
      ? '마지막 멤버라 나가면 크루가 닫혀요.'
      : isCaptain
        ? '캡틴은 가장 먼저 들어온 멤버에게 넘어가요.'
        : null,
    joinsLeftThisMonth > 0
      ? `이번 달엔 크루를 ${joinsLeftThisMonth}번 더 옮길 수 있어요.`
      : '이번 달엔 다른 크루에 더 들어갈 수 없어요.',
  ].filter(Boolean).join(' ');
}

export function buildCrewKickConfirmMessage(memberName: string, isPreseason: boolean): string {
  return [
    `${memberName}님을 내보내면 ${CREW_KICK_BAN_DAYS}일 동안 이 크루에 다시 들어올 수 없어요.`,
    // 7일 규칙: 이번 시즌 인정 기간이 7일을 넘긴 멤버는 나가도 시즌 멤버(분모)로 남는다.
    // 프리시즌엔 7일 규칙이 꺼져 있어 이 말이 성립하지 않는다.
    isPreseason ? null : `이번 달에 ${CREW_NEWCOMER_DAYS}일 넘게 함께한 멤버는 이번 시즌 인원수에 남아요.`,
  ].filter(Boolean).join(' ');
}

export function buildCrewRotateCodeConfirmMessage(inviteCode: string): string {
  return `새 코드를 만들면 지금 코드 ${inviteCode}는 바로 못 써요.`;
}

export function buildCrewTransferCaptainConfirmMessage(memberName: string): string {
  return `${memberName}님이 캡틴이 되면 멤버 관리와 초대 코드는 ${memberName}님이 맡아요.`;
}

// --- 점수 설명 카드 ---

export function buildCrewScoreFormulaLine(priorKm: number): string {
  return `보정 인당 = (크루 총거리 + 기준 ${formatCrewKm(priorKm)}km × ${CREW_SHRINKAGE_MEMBERS}) ÷ (시즌 멤버 + ${CREW_SHRINKAGE_MEMBERS})`;
}

// 예시 하나: 3명이 330km — 설계 원안의 예시와 같은 크루다.
export function buildCrewScoreExampleLine(priorKm: number): string {
  const exampleMembers = 3;
  const exampleTotalKm = 330;
  const score = computeCrewScore(exampleTotalKm, exampleMembers, priorKm);
  const priorPart = formatCrewKm(roundKm(priorKm * CREW_SHRINKAGE_MEMBERS));
  return `예: ${exampleMembers}명이 ${exampleTotalKm}km를 달리면 (${exampleTotalKm} + ${priorPart}) ÷ ${exampleMembers + CREW_SHRINKAGE_MEMBERS} = ${formatCrewScore(score)}km`;
}

// 순위 기준 페이지의 규칙 줄 (오너 2026-09-18: '앱 기록만'·'하루 45km'는 규칙째 없앴고, 프리시즌은
// 가입 순간부터, 확정은 달 끝 1시간 뒤).
export function buildCrewScoreRuleLines(isPreseason: boolean): string[] {
  return [
    isPreseason
      ? '프리시즌엔 가입하자마자 바로 합류해요'
      : `이번 달에 들어온 멤버는 ${CREW_NEWCOMER_DAYS}일 뒤 합류해요`,
    '달이 끝나고 1시간 뒤 확정돼요',
  ];
}

export function formatCrewRequestDate(createdAt: string): string {
  const label = formatCrewMonthDay(createdAt);
  return label ? `${label} 신청` : '가입 신청';
}

export function buildCrewSearchMeta(memberCount: number, rank: number | null): string {
  return `${memberCount}명 · ${formatCrewRank(rank)}`;
}

// 크루 찾기 결과 위 안내 한 줄과 빈 결과 문구. 빈 검색어(둘러보기)인데 결과가 없으면 크루가
// 아직 하나도 없는 것 — '이름을 다시 확인해 주세요'는 치지도 않은 이름을 탓한다 (적대 리뷰
// 2026-09-18: 출시 첫날 크루 없는 사람이 가장 먼저 닿는 화면이다).
export function describeCrewSearchResults(
  submittedQuery: string,
  resultCount: number,
): { hint: string | null; empty: string | null } {
  if (resultCount > 0) {
    return {
      hint: submittedQuery ? `'${submittedQuery}' 검색 결과` : '이번 시즌 순위 순서예요. 눌러서 보고 가입 신청할 수 있어요.',
      empty: null,
    };
  }

  return submittedQuery
    ? { hint: `'${submittedQuery}' 검색 결과`, empty: '찾는 크루가 없어요. 이름을 다시 확인해 주세요.' }
    : { hint: null, empty: '아직 만들어진 크루가 없어요. 첫 크루를 만들어 보세요.' };
}
