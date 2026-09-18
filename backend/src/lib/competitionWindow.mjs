// 경쟁 집계의 '인정 창' 공용 모듈 (2026-09-18 크루대전 도입 때 runmadang에서 추출).
//
// 그라운드(기간제 내기)와 크루대전(월간 크루 리그)은 같은 질문을 한다: "이 러닝이 이 창
// 안에서 뛴 것으로 인정되는가?" 두 기능이 각자 판정식을 들고 있으면 한쪽만 고쳐지는 순간
// '그라운드에선 인정, 크루에선 불인정' 같은 어긋남이 생긴다 — 판정식은 여기 한 곳에만 둔다.
// (동작 변화 없음: runmadang의 모듈 비공개 함수를 그대로 옮겼다.)

// 늦은 오프라인 업로드 유예 — 기간 안에 뛴 기록이 bg-sync 지연으로 종료 후에 저장돼도
// 이 시간 안이면 인정한다.
export const RUN_UPLOAD_GRACE_MS = 48 * 60 * 60 * 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 집계 인정 조건 (적대 리뷰 2026-08-06):
// 1. 끝난 시각(endedAt, 옛 기록은 createdAt 폴백)이 [fromMs, endMs) 안 — fromMs는
//    참가자별 max(판 시작, 참가 시각). 참가 전 기록을 소급 인정하면 초대만 받아놓고
//    이기고 있을 때만 막판에 참가하는 무위험 옵션이 생긴다.
// 2. 서버가 찍은 저장 시각(createdAt)도 창(+늦은 업로드 유예) 안 — endedAt은
//    클라이언트 임의값이라, 창 밖에서 저장된 기록을 창 안 시각으로 위조해 넣는 것을
//    서버 시각으로 막는다. (창 안에서 과거 러닝을 복제 재저장하는 변종은 GPS 경로
//    지문 비교가 필요해 안티치트 3단계 백로그.)
// 임포트/수동 기록·차량 판정은 isCompetitiveRun이 걸러낸다 — 이 함수는 시각만 본다.
export function isRunCountable(run, fromMs, endMs, graceMs = RUN_UPLOAD_GRACE_MS) {
  const endedMs = resolveRunEndedMs(run);
  if (!Number.isFinite(endedMs) || endedMs < fromMs || endedMs >= endMs) {
    return false;
  }

  const savedMs = Date.parse(run.createdAt ?? '');
  if (!Number.isFinite(savedMs)) {
    return true; // createdAt 없는 옛 기록 폴백
  }
  return savedMs >= fromMs && savedMs < endMs + graceMs;
}

// 러닝이 끝난 시각 — endedAt이 없는 옛 기록은 저장 시각(createdAt)으로 폴백.
export function resolveRunEndedMs(run) {
  return Date.parse(run?.endedAt ?? run?.createdAt ?? '');
}

// 'YYYY-MM-DD'(KST 달력 날짜)의 0시 KST를 UTC ms로.
export function parseKstDayStartMs(dateKey) {
  return Date.parse(`${dateKey}T00:00:00+09:00`);
}

// 어떤 순간의 KST 날짜 키. formatKstDateKey(Intl)와 같은 값이지만 러닝 전체를 한 번 훑는
// 집계 루프에서 부르므로 산술로 싸게 만든다 (KST는 서머타임이 없어 +9h 고정).
export function kstDateKeyOfMs(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 그 순간이 속한 KST 날짜의 0시.
export function kstDayStartMs(ms) {
  return parseKstDayStartMs(kstDateKeyOfMs(ms));
}

// 그 순간 '다음' KST 0시 — 정확히 0시에 들어와도 그날이 아니라 다음 날 0시다.
// 크루 가입 인정 시각(countsFrom)의 기준: 하루에 두 크루에서 동시에 인정받을 수 없게 한다.
export function nextKstMidnightMs(ms) {
  return kstDayStartMs(ms) + DAY_MS;
}
