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

// '확정된 결과'와 '집계 중 자리표시자'를 가른다 (적대 검증 2026-08-24가 잡은 구멍: 라이브
// 매치는 스탠딩만 동기화돼도 항상 PENDING 블롭('결과 집계 중')을 들고 있어서, 블롭의
// 존재 여부로 게이트를 막으면 변환이 정확히 사고 경로에서 영영 안 걸린다). 판별은
// matchResultModel의 영속 계약 그대로: 듀얼 PENDING은 resultTone을 절대 싣지 않고(C1),
// 그룹 PENDING은 rank를 절대 싣지 않는다 — 그래서 resultTone(승/패/무·기권 패)이나
// rank(그룹 확정 순위·기권 순위)가 실려 있어야만 확정이다. 상대 기권 승 블롭은
// resultTone 'win'을 즉시 실으므로 승자는 여전히 절대 변환되지 않는다.
export function isDecidedMatchResult(
  result: { resultTone?: string; rank?: number } | null | undefined,
): boolean {
  if (!result) {
    return false;
  }

  return typeof result.resultTone === 'string' || typeof result.rank === 'number';
}

export function shouldConvertSaveToSubGoalForfeit({
  activeMatchId,
  declaredFinishDistanceKm,
  matchGoalDistanceKm,
  resolvedMatchMode,
  hasDecidedMatchResult,
}: {
  activeMatchId: string | null;
  // 실제로 전송할 값과 동일해야 한다: 프리즈 우선 finishIntent.distanceKm. 프리즈가
  // 있으면 목표를 밟았다는 증거라 게이트는 절대 안 걸린다.
  declaredFinishDistanceKm: number | null;
  matchGoalDistanceKm: number | null;
  resolvedMatchMode: 'duel' | 'group' | null;
  // 이미 **확정된** 결과가 있으면(상대 기권 승, 기권 커맨드의 override, 재시도 컨텍스트의
  // 기권 블롭) 건드리지 않는다 — 승자를 기권시키는 사고가 미달 완주보다 나쁘다. 반드시
  // isDecidedMatchResult로 판별한 값을 넣어라: 블롭의 단순 존재 여부를 넣으면 라이브
  // 매치의 상시 PENDING 블롭이 게이트를 영영 막는다.
  hasDecidedMatchResult: boolean;
}): boolean {
  return Boolean(
    activeMatchId
    && !hasDecidedMatchResult
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
