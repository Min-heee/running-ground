// 크루대전 규칙 상수 — 한 곳에만 둔다 (오너 승인 스펙 v1, 2026-09-18).
//
// 화면에 보이는 숫자(정원 30, 월 이동 3회, 하루 45km, 7일 합류, 48시간 확정)는 클라이언트
// crewModel에 같은 값으로 거울처럼 들어간다 — 여기 값을 바꾸면 클라 문구도 같이 바꿔야 한다.

import { ApiError } from '../../response/httpResponse.mjs';
import { RANKING_STARS_SEAL_DELAY_MS } from '../monthlyRankingStars.mjs';
import { DAY_MS } from '../competitionWindow.mjs';

// 활성 멤버 정원 — 그룹 매치 최대 인원(30)과 같다. 꽉 차면 crew_full.
export const CREW_MAX_MEMBERS = 30;

// KST 한 달에 새로 들어갈 수 있는 횟수 — 코드 가입·승인된 신청·크루 만들기를 모두 센다.
// 한 사람이 여러 크루를 돌며 '용병'으로 돕는 효과를 묶는 장치다.
export const CREW_JOINS_PER_MONTH = 3;

// 크루 만들기는 30일에 1개 — 이름 선점·도배 방지.
export const CREW_CREATE_COOLDOWN_MS = 30 * DAY_MS;

// 내보낸 사람은 그 크루에 30일 동안 다시 못 들어온다(코드·신청 둘 다).
export const CREW_KICK_BAN_MS = 30 * DAY_MS;

// 가입 신청은 7일이 지나면 만료 — 상태로 저장하지 않고 createdAt에서 도출한다.
export const CREW_JOIN_REQUEST_TTL_MS = 7 * DAY_MS;

// 같은 크루에 다시 신청하기까지 기다리는 시간 (적대 리뷰 2026-09-18): 신청 → 취소를 되풀이하면
// 신청마다 캡틴에게 알림이 가서 하루 1,440통까지 쌓이고(알림함 50개 상한이 진짜 알림을 밀어낸다),
// 취소된 행이 블롭에 30일씩 남았다. 취소 뒤 하루, 거절 뒤 7일은 그 크루에 다시 신청할 수 없다
// (request_cooldown). 다른 크루에는 바로 신청할 수 있다 — 막는 건 한 캡틴을 두드리는 반복뿐이다.
export const CREW_REQUEST_CANCEL_COOLDOWN_MS = DAY_MS;
export const CREW_REQUEST_REJECT_COOLDOWN_MS = 7 * DAY_MS;

// 이름: 앞뒤 공백 제거 후 2~12자, 한글 완성형·영문·숫자·단일 공백만.
export const CREW_NAME_MIN_LENGTH = 2;
export const CREW_NAME_MAX_LENGTH = 12;
export const CREW_NAME_PATTERN = /^[가-힣A-Za-z0-9]+(?: [가-힣A-Za-z0-9]+)*$/;

// 금칙어 — 전국 순위표에 그대로 노출되는 이름이라 최소한의 1차 방어선(우회 표기는 못 막는다,
// 그래서 운영자 이름 변경·종료 엔드포인트가 함께 간다). 공백 제거·소문자 키(nameKey)에
// 부분 문자열로 대조한다. 운영 주체를 사칭하는 단어도 막는다.
export const CREW_NAME_BLOCKLIST = [
  // 운영 사칭
  '러닝그라운드', 'runningground', '운영', '관리자', 'admin', 'official', '공식',
  // 욕설·성적 표현 (한글)
  '씨발', '시발', '씨바', '씨팔', '시팔', '병신', '븅신', '좆', '존나', '졸라', '개새', '새끼',
  '미친놈', '미친년', '지랄', '염병', '느금', '니미', '애미', '섹스', '보지', '자지', '창녀',
  '걸레', '일베',
  // 욕설·성적 표현 (영문)
  'fuck', 'shit', 'bitch', 'sex', 'porn', 'dick', 'pussy', 'asshole',
];

// 초대 코드: publicTag와 같은 32자 알파벳(헷갈리는 I, O, 0, 1 제외) 6자리.
export const CREW_INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CREW_INVITE_CODE_LENGTH = 6;
export const CREW_INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

// 시즌 점수 ---------------------------------------------------------------------------------

// 멤버별 KST 하루 인정 상한 — 스크립트 클라이언트·GPS 조작의 피해를 계정당 하루 45km로 묶는다.
export const CREW_DAY_CAP_KM = 45;

// 7일 규칙: 이번 시즌에 들어오거나 나간 멤버는 시즌 안 인정 기간이 7일 이상이어야 인원수(N)와
// 총거리(T)에 들어간다 — 막판 용병과 사보타주 계정을 막는다.
export const CREW_NEW_MEMBER_MIN_MS = 7 * DAY_MS;

// 기준 평균 P의 기본값 — 직전 시즌 봉인 원장이 없을 때(첫 시즌) 쓴다. P는 시즌 동안 고정이다
// (심판 필수 수정: 실시간 ΣT/ΣN은 남의 크루가 뛰기만 해도 작은 크루 순위를 흔든다).
export const CREW_DEFAULT_PRIOR_KM = 30;

// 순위 자격: 시즌 멤버 3명 이상 + 총거리 > 0. 별 자격: 여기에 실제로 뛴 멤버 3명 이상.
export const CREW_MIN_RANKED_MEMBERS = 3;
export const CREW_MIN_CHAMPION_RUNNERS = 3;

// 프리시즌 = 출시 달(2026-09)부터 2026-10까지 (오너 2026-09-18, 같은 날 '10월까지 연장'):
// 순위표는 돌고 원장에도 봉인되지만 별·결과 알림이 없고 7일 규칙도 끈다. 첫 별 시즌은 그다음 달.
// 첫 시즌보다 앞선 시즌은 존재하지 않는다. 기간을 또 바꾸면 LAST와 FIRST_STAR를 함께 옮긴다 —
// 앱은 시즌 응답의 firstStarSeasonKey로 '별은 N월 시즌부터'를 쓰므로 OTA 없이 따라온다.
export const CREW_FIRST_SEASON_KEY = '2026-09';
export const CREW_PRESEASON_LAST_KEY = '2026-10';
export const CREW_FIRST_STAR_SEASON_KEY = '2026-11';

// 봉인 유예 — 월간 랭킹 별과 같은 48시간(늦은 업로드·늦게 붙는 차량 판정을 받아낸다).
export const CREW_SEASON_SEAL_DELAY_MS = RANKING_STARS_SEAL_DELAY_MS;
export const CREW_SEASON_RULE_VERSION = 1;

// 봉인 원장 스냅샷의 상위 행 수(시즌당 원장 크기를 ~2KB로 묶는다).
export const CREW_AWARD_TOP_LIMIT = 10;
// 크루 탭 홈의 '크루 순위' 카드 행 수.
export const CREW_HOME_TOP_LIMIT = 5;
export const CREW_SEARCH_LIMIT = 20;

// 정리 -------------------------------------------------------------------------------------

// 종료된 크루·나간 멤버 행은 70일 뒤 정리 — 봉인(시즌 끝+48h)보다 한참 뒤라 집계에 영향이 없다.
export const CREW_CLOSED_RETENTION_MS = 70 * DAY_MS;
// 결정된 가입 신청은 30일 뒤 정리. 단 취소된 신청은 재신청 대기(하루)가 끝나면 바로 정리한다 —
// 신청·취소 반복으로 블롭이 불어나지 않게(취소 행은 대기 판정 말고는 쓸 데가 없다).
export const CREW_DECIDED_REQUEST_RETENTION_MS = 30 * DAY_MS;

// 레이트 리밋 — 미리보기·코드 가입·가입 신청(취소와 한 통)·검색·코드 재발급 각각 사용자당
// 10분에 10회.
export const CREW_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const CREW_RATE_LIMIT_MAX = 10;

// 오류 코드 → 기본 한국어 문구. 클라이언트(crewModel)가 code로 분기해 자체 문구를 쓰고,
// 모르는 코드는 이 message로 폴백한다.
const CREW_ERRORS = {
  not_found: [404, '크루를 찾을 수 없어요.'],
  not_captain: [403, '캡틴만 할 수 있어요.'],
  not_member: [403, '크루 멤버가 아니에요.'],
  already_in_crew: [409, '지금 크루를 나가야 가입할 수 있어요.'],
  request_pending: [409, '이미 기다리는 가입 신청이 있어요.'],
  request_cooldown: [409, '이 크루에는 조금 뒤에 다시 신청할 수 있어요.'],
  crew_full: [409, '인원이 꽉 찼어요.'],
  crew_banned: [403, '이 크루에는 30일 동안 다시 들어갈 수 없어요.'],
  join_limit: [400, `이번 달 크루 이동 ${CREW_JOINS_PER_MONTH}번을 다 썼어요.`],
  create_limit: [400, '크루는 30일에 한 번만 만들 수 있어요.'],
  invalid_name: [400, `크루 이름은 ${CREW_NAME_MIN_LENGTH}~${CREW_NAME_MAX_LENGTH}자 한글·영문·숫자로 지어주세요.`],
  blocked_name: [400, '쓸 수 없는 단어가 들어 있어요.'],
  name_taken: [409, '이미 있는 크루 이름이에요.'],
  rate_limited: [429, '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'],
};

export function createCrewError(code, details = {}) {
  const [statusCode, message] = CREW_ERRORS[code] ?? [400, '요청을 처리하지 못했어요.'];
  return new ApiError(statusCode, message, { ...details, code });
}

export function throwCrewError(code, details) {
  throw createCrewError(code, details);
}
