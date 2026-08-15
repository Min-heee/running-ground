// 우주 배치 수학 — 순수 함수만. 화면은 여기서 나온 좌표를 그리기만 한다.
//
// 천체는 동심 궤도에 앉힌다. 안쪽 궤도일수록 상위(크기 큰 순)라서, 중심에 가까울수록 잘
// 달린 동네라는 게 한눈에 읽힌다.

export type OrbitSlot = {
  ring: number;
  angle: number;
  // 단위원 좌표 — 컴포넌트가 궤도 반지름을 곱해서 쓴다.
  unitX: number;
  unitY: number;
};

// 궤도별 정원. 안쪽은 좁고 바깥으로 갈수록 넓어진다(둘레가 늘어나니까).
const RING_CAPACITIES = [6, 10, 14, 18, 22];

// 궤도마다 시작 각도를 조금씩 틀어서 천체가 한 줄로 나란히 서지 않게 한다(황금각).
const RING_ANGLE_OFFSET = 0.618;

export function buildOrbitSlots(count: number): OrbitSlot[] {
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const slots: OrbitSlot[] = [];
  let placed = 0;
  let ring = 0;

  while (placed < count) {
    const capacity = RING_CAPACITIES[Math.min(ring, RING_CAPACITIES.length - 1)];
    const inThisRing = Math.min(capacity, count - placed);

    for (let index = 0; index < inThisRing; index += 1) {
      const angle = (index / inThisRing) * Math.PI * 2 + ring * RING_ANGLE_OFFSET;

      slots.push({
        ring,
        angle,
        unitX: Math.cos(angle),
        unitY: Math.sin(angle),
      });
    }

    placed += inThisRing;
    ring += 1;
  }

  return slots;
}

export function countRings(slots: OrbitSlot[]): number {
  return slots.reduce((max, slot) => Math.max(max, slot.ring + 1), 0);
}

// 궤도 반지름 — 가장 바깥 궤도가 maxRadius에 닿는다. 궤도가 하나뿐이면 안쪽에 모은다.
export function ringRadius(ring: number, ringCount: number, maxRadius: number): number {
  if (ringCount <= 0 || maxRadius <= 0) {
    return 0;
  }

  return (maxRadius * (ring + 1)) / ringCount;
}

export type StarFieldDot = {
  // 캔버스 대비 0~1 비율 — 화면 크기가 바뀌어도 같은 자리에 뜬다.
  x: number;
  y: number;
  size: number;
  opacity: number;
};

// 배경 별 — 렌더마다 자리가 바뀌면 우주가 지진 난 것처럼 보이므로 시드 고정 난수를 쓴다.
export function buildStarField(count: number, seed = 20260815): StarFieldDot[] {
  const dots: StarFieldDot[] = [];
  let state = seed;

  const next = () => {
    // 선형 합동 생성기 — 재현만 되면 되므로 품질은 중요하지 않다.
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let index = 0; index < count; index += 1) {
    dots.push({
      x: next(),
      y: next(),
      size: 1 + Math.round(next() * 1.6),
      opacity: 0.18 + next() * 0.42,
    });
  }

  return dots;
}
