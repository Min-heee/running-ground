// 줌 기반 LOD (오너 2026-08-15: "확대할수록 항성·행성에 가까워지게").
//
// 층을 탭으로 갈아타는 대신, 확대가 깊어지면 화면 중앙의 은하가 **그 자리에서** 풀린다:
// 나선 원반이 옅어지고 그 안의 항성·행성이 떠오른다. 축소하면 되감긴다.
//
// 여기는 순수 판정만 — 어떤 은하가 초점인지, 얼마나 풀렸는지. 데이터 로드와 렌더는 화면이
// 한다. 이 규칙이 화면 안에 흩어지면 "왜 갑자기 풀렸지"를 추적할 수 없게 된다.

// 배율 한계도 여기 둔다 — 문턱들과 한 파일에 있어야 "확대해도 못 들어가는" 순서 붕괴를
// 테스트가 잡을 수 있다(뷰포트 훅은 react-native를 끌어와 순수 테스트에서 못 읽는다).
export const UNIVERSE_MIN_ZOOM = 0.6;
export const UNIVERSE_MAX_ZOOM = 12;

// 이 배율부터 초점 은하의 내부가 비치기 시작한다.
export const LOD_ENTER_ZOOM = 2.6;
// 이 배율에서 완전히 풀린다(원반은 거의 사라지고 행성이 주인공).
export const LOD_FULL_ZOOM = 5;
// 여기를 넘기면 '들어간다' — 초점 천체를 실제로 열고 배율은 1로 돌아간다.
//
// 왜 미리보기에서 끝내지 않는가: 우주는 전국 → 도 → 시/군/구 → 회원으로 4층이라, 한 층의
// 미리보기만으로는 오너가 말한 "확대할수록 항성·행성에 가까워지는" 연속감이 두 번째 층에서
// 끊긴다. 미리보기(LOD)는 다리, 이 문턱이 그 다리의 끝이다.
export const LOD_COMMIT_ZOOM = 7.5;

export type LodCandidate = {
  id: string;
  // 기저 좌표(뷰포트 변환 전). 아래 resolveFocusedBody 주석 참고.
  screenX: number;
  screenY: number;
};

// 초점으로 인정할 최대 거리 — 화면 짧은 변의 이 비율(기저 좌표 기준).
export const LOD_FOCUS_RADIUS_RATIO = 0.35;
// 진입은 더 좁게 — 화면에서 실제로 가까울 때만. 텅 빈 우주를 확대하다 엉뚱한 지역으로
// 빨려 들어가는 걸 막는다.
export const LOD_COMMIT_RADIUS_RATIO = 0.2;

// 0(닫힘) ~ 1(완전히 풀림).
export function computeLodReveal(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= LOD_ENTER_ZOOM) {
    return 0;
  }

  if (zoom >= LOD_FULL_ZOOM) {
    return 1;
  }

  return (zoom - LOD_ENTER_ZOOM) / (LOD_FULL_ZOOM - LOD_ENTER_ZOOM);
}

// 초점 은하 = 화면 중앙에 가장 가까운 것. 단, 중앙에서 너무 멀면 초점이 없다 — 아무것도
// 조준하지 않은 채 확대만 한 상태에서 엉뚱한 은하가 풀리는 걸 막는다.
//
// 거리는 **기저 좌표**로 재야 한다(호출자가 화면 거리를 배율로 나눠 넘긴다). 화면 거리로
// 재면 커서 고정 확대가 천체를 중앙에서 밀어내면서 배율이 오를수록 초점이 스스로 풀린다 —
// 확대할수록 열려야 하는데 확대할수록 닫히는 뒤집힌 동작이 된다.
export function resolveFocusedBody(
  candidates: LodCandidate[],
  centerX: number,
  centerY: number,
  maxDistance: number,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;

  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.screenX - centerX, candidate.screenY - centerY);

    if (!best || distance < best.distance) {
      best = { id: candidate.id, distance };
    }
  }

  return best && best.distance <= maxDistance ? best : null;
}

// 풀린 정도에 따른 원반/행성의 표시 강도. 원반은 완전히 사라지지 않는다 — 은하가 어디였는지
// 흔적이 남아야 축소했을 때 시선이 끊기지 않는다.
export function resolveLodOpacity(reveal: number): { disk: number; planets: number } {
  const clamped = Math.max(0, Math.min(1, reveal));

  return {
    disk: 1 - 0.78 * clamped,
    planets: clamped,
  };
}
