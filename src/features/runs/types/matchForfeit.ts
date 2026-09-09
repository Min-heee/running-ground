export type ForfeitedMatchSnapshot = {
  matchId: string;
  forfeitedAt: number;
  elapsedSeconds: number;
  distanceKm: number;
  paceLabel: string;
  // 부정 러닝 실격 기권 (케이던스 워치독) — 일반 기권 스냅샷에는 없다.
  disqualified?: boolean;
};
