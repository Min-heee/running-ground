// 레이스 이벤트 완주 보상 스탬프 (815런, docs/815-run-plan-2026-08-11.md).
//
// 지급 함수가 없다 — 경찰과 도둑런(run.chase.bonusPoints)과 같은 파생 회계 구조다: 저장 순간
// run.raceEvent = { eventId, title, bonusPoints }를 박제하고, points.mjs의 재계산이
// 언제나 이 스탬프에서 합산한다. 원장 오염·이중 지급·소급 유실이 구조적으로 불가능하다.
//
// 안전 장치:
//  - matchId는 검증되지 않는 클라 입력이다 — 보상은 (1) 그 matchId를 formedMatchId로 박제한
//    이벤트가 실제로 존재하고, (2) 저장자가 그 매치의 내구 로스터(matchRosters, 세션 생성
//    길목에서 서버가 기록) 참가자일 때만. 로스터가 사라졌으면(만료/축출) 안전하게 미지급.
//  - 완주 판정은 이벤트가 공표한 거리 기준. 허용오차는 매치 목표 판정과 같은 철학의
//    0.05km(GPS 이산성 + 표시 반올림) — 8.10km 저장이 8.15km 행사를 완주로 인정받는 상한.
//  - 보상 필드(completionBonusPoints)가 없는 이벤트(테스트런 등)는 스탬프 자체가 없다 —
//    기록은 평범한 그룹 대결로 남는다. (오너 확정 2026-08-12: 배지 없이 포인트만.)

import { findMatchRoster, isMatchRosterParticipant } from './matchRosters.mjs';

export const RACE_COMPLETION_TOLERANCE_KM = 0.05;

export function resolveRaceEventCompletionStamp(store, userId, { matchId, distanceKm }) {
  if (typeof matchId !== 'string' || !matchId) {
    return null;
  }

  const event = (store.offlineRaceEvents ?? []).find((entry) => entry.formedMatchId === matchId);

  if (!event) {
    return null;
  }

  const bonusPoints = Number.isFinite(event.completionBonusPoints)
    ? Math.max(0, Math.round(event.completionBonusPoints))
    : 0;

  if (bonusPoints <= 0) {
    return null;
  }

  const roster = findMatchRoster(store, matchId);

  if (!isMatchRosterParticipant(roster, userId)) {
    return null;
  }

  const goalKm = Number(event.distanceKm);

  if (!Number.isFinite(goalKm) || goalKm <= 0) {
    return null;
  }

  if ((Number(distanceKm) || 0) + RACE_COMPLETION_TOLERANCE_KM < goalKm) {
    return null;
  }

  return {
    eventId: event.id,
    title: event.title,
    bonusPoints,
  };
}
