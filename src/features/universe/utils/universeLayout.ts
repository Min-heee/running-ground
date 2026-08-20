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

// 이름표 솎아내기 — 서울처럼 25개가 한 화면에 들어오면 이름이 서로 겹쳐 아무것도 못 읽는다.
//
// 규칙: 중요한 것부터(호출자가 그 순서로 넘긴다) 자리를 잡고, 이미 놓인 이름과 겹치거나
// 화면 밖이면 그 이름은 접는다. 천체와 누를 자리는 그대로 남는다 — 이름만 사라진다.
// 확대하면 사이가 벌어져 접혔던 이름이 저절로 돌아온다(그 자체가 '확대할수록 더 보인다').
export type LabelBox = {
  id: string;
  // 이름표 상자의 화면 좌표(중심 x, 위쪽 y).
  centerX: number;
  top: number;
  width: number;
  height: number;
};

export function pickVisibleLabels(
  boxes: LabelBox[],
  canvasWidth: number,
  canvasHeight: number,
): Set<string> {
  const visible = new Set<string>();
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];

  for (const box of boxes) {
    const rect = {
      left: box.centerX - box.width / 2,
      right: box.centerX + box.width / 2,
      top: box.top,
      bottom: box.top + box.height,
    };

    // 화면 밖은 애초에 읽을 수 없다 — 겹침 계산에서도 빼서 안쪽 이름을 잡아먹지 않게 한다.
    if (rect.right < 0 || rect.left > canvasWidth || rect.bottom < 0 || rect.top > canvasHeight) {
      continue;
    }

    const collides = placed.some((other) => rect.left < other.right
      && rect.right > other.left
      && rect.top < other.bottom
      && rect.bottom > other.top);

    if (collides) {
      continue;
    }

    placed.push(rect);
    visible.add(box.id);
  }

  return visible;
}
