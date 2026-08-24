// ── 완주 선언 거리 게이트, 클라 반쪽 (2026-08-23 실전 사고) ────────────────────────
// '대결종료'는 매치가 붙어 있으면 무조건 status='finished'를 보냈고, 서버는 그 말을
// 그대로 믿어 4.93km에서 종료한 러너가 7km 그룹런 1위로 확정됐다. 목표 미달 종료는
// 완주가 아니라 기권이다 — '기권하기'를 누른 러너와 같은 기록으로 남는다. 서버도 같은
// 게이트를 갖지만(미달 선언은 'running' 강등 후 §B4 DNF), 클라가 먼저 기권을 선언해야
// 상대 화면이 스톨 창을 기다리지 않고 즉시 정리되고 내 기록에도 '기권' 카드가 남는다.

// 서버 MATCH_GOAL_DISTANCE_TOLERANCE_KM(backend matchConstants.mjs)와 같은 값이어야
// 한다. 클라가 서버보다 엄격하면 서버가 완주로 받아줄 기록을 기권으로 바꿔버리고,
// 느슨하면 finished 선언이 서버에서 'running' 강등만 되고 기권 기록 없이 §B4 DNF를
// 기다리게 된다.
export const MATCH_GOAL_FINISH_TOLERANCE_KM = 0.005;

export function shouldConvertSaveToSubGoalForfeit({
  activeMatchId,
  declaredFinishDistanceKm,
  matchGoalDistanceKm,
  resolvedMatchMode,
  hasResolvedMatchResult,
}: {
  activeMatchId: string | null;
  // 실제로 전송할 값과 동일해야 한다: 프리즈 우선 finishIntent.distanceKm. 프리즈가
  // 있으면 목표를 밟았다는 증거라 게이트는 절대 안 걸린다.
  declaredFinishDistanceKm: number | null;
  matchGoalDistanceKm: number | null;
  resolvedMatchMode: 'duel' | 'group' | null;
  // 이미 확정된 결과가 있으면(상대 기권 승, 기권 커맨드의 override, 재시도 컨텍스트)
  // 건드리지 않는다 — 승자를 기권시키는 사고가 미달 완주보다 나쁘다.
  hasResolvedMatchResult: boolean;
}): boolean {
  return Boolean(
    activeMatchId
    && !hasResolvedMatchResult
    && (resolvedMatchMode === 'duel' || resolvedMatchMode === 'group')
    && typeof matchGoalDistanceKm === 'number'
    && Number.isFinite(matchGoalDistanceKm)
    && matchGoalDistanceKm > 0
    && typeof declaredFinishDistanceKm === 'number'
    && Number.isFinite(declaredFinishDistanceKm)
    // 목표 거리를 모르면(런타임 소실 저장) 예전대로 finished를 보내고 서버 게이트가
    // 판정한다 — 서버가 항상 최종 권위다.
    && declaredFinishDistanceKm < matchGoalDistanceKm - MATCH_GOAL_FINISH_TOLERANCE_KM,
  );
}
