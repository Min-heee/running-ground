// 하나의 연속된 우주 (오너 2026-08-16: "확대한다고 전환되는 게 아니라, 뭉쳐 있던 게 점점
// 커지면서 풀리는 것").
//
// 층을 갈아끼우지 않는다. 대한민국 안에 시/도가, 그 안에 시/군/구가, 그 안에 회원이 **실제로
// 들어 있는** 하나의 좌표계를 만들고, 화면은 그 공간을 확대·이동할 뿐이다. 멀리서는 뭉쳐서
// 은하로 보이고 가까이 가면 그 뭉침이 낱개로 풀린다 — 실제 하늘이 그런 것처럼.
//
// 좌표는 '우주 단위'다. 원점이 대한민국의 중심이고, 화면 변환은 화면 쪽이 건다:
//   screen = canvasCenter + universe * zoom + pan
//
// 여기서는 두 가지만 정한다: ① 자식을 부모 안 어디에 얼마 크기로 앉힐지 ② 지금 화면 크기로
// 봤을 때 그것이 뭉친 덩어리인지 풀린 무리인지. 둘 다 순수 함수다.

import { buildOrbitSlots, countRings } from './universeLayout';
import type { MapPoint } from './koreaMapPositions';

// 부모 반지름 중 자식들이 쓰는 몫. 나머지는 가장자리 여백 — 원반 팔이 부모 밖으로 삐져나가
// 이웃과 섞이지 않게 한다.
const CHILD_FILL = 0.92;
// 자식 반지름 상한 = (궤도 간격, 같은 궤도의 각도 간격) 중 좁은 쪽 × 이 비율. 형제끼리
// 겹치지 않게 하는 유일한 장치다.
//
// 0.44 → 0.3 → 0.16으로 계속 낮췄다 (오너 2026-08-16: "훨씬 거리를 벌려줘, 원래 우주는
// 광활하잖아"). 겹치지만 않으면 되는 게 아니라 천체 사이에 **빈 하늘이 압도적으로 넓어야**
// 우주로 읽힌다 — 실제 별 사이 거리는 별 지름의 수천만 배다.
const CHILD_CLEARANCE = 0.16;
// 자식이 하나뿐이면 궤도가 의미 없다 — 부모 중심에 앉힌다.
const SINGLE_CHILD_RADIUS = 0.55;
// 크기 차이는 보이되 큰 쪽이 이웃을 삼키지는 않게: 상한의 55~100% 사이에서만 논다.
const SIZE_FLOOR = 0.55;

// 우주의 크기는 **고정**이다. 화면 크기로 정하면 안 된다: 키보드가 올라오거나 검색 목록이
// 펼쳐지거나 기기를 돌리는 순간 모든 좌표가 한꺼번에 다시 계산되는데 카메라는 그대로라,
// 보고 있던 천체가 아무 동작 없이 화면 밖 수천 픽셀로 날아간다. 화면에 맞추는 일은 카메라가
// (배율로) 한다 — 세계는 가만히 있는다.
export const UNIVERSE_ROOT_RADIUS = 1000;

// 배율은 '나라 전체가 화면에 꽉 차는 배율'의 배수로 잰다. 화면 크기가 바뀌어도 이 배수는
// 그대로라 체감이 같다.
export const UNIVERSE_MIN_ZOOM_FACTOR = 0.35;
// 위쪽이 이렇게 큰 건 이 공간이 4겹인데다 사이가 아주 넓기 때문이다 — 나라를 담은
// 상태에서 한 사람의 행성까지 가려면 수천 배가 필요하다.
export const UNIVERSE_MAX_ZOOM_FACTOR = 6000;

// 나라 전체가 화면에 들어차는 배율.
export function fitZoomFor(canvasWidth: number, canvasHeight: number): number {
  const half = Math.min(canvasWidth, canvasHeight) / 2;

  return half > 0 ? (half * 0.92) / UNIVERSE_ROOT_RADIUS : 1;
}

export type SpacePlacement = {
  x: number;
  y: number;
  // 깊이. 부모 반지름에 비례하는 범위 안에서만 논다 — 어느 층에서 보든 깊이감이 같으려면
  // 절대값이 아니라 그 층의 크기에 대한 비율이어야 한다.
  z: number;
  radius: number;
};

// 깊이 퍼짐(부모 반지름 대비). 이게 0이면 우주가 종이처럼 납작해진다 (오너 2026-08-16:
// "아직 우주가 이질적이야 너무 평면화 되어있거든"). 원근 카메라로 옮기면서 키웠다 —
// 이제 깊이는 크기 흉내가 아니라 실제로 카메라가 지나가는 거리다.
const DEPTH_SPREAD = 0.55;
// 궤도를 흐트러뜨리는 정도 — **남는 틈** 대비 비율이다. 궤도 반지름 대비로 잡으면 바깥
// 궤도에서 흔들림이 간격보다 커져 천체가 서로를 삼킨다. 완벽한 동심원은 우주가 아니라
// 도표로 읽히지만, 흐트러뜨리는 값은 언제나 빈 자리 안에서만 놀아야 한다.
const JITTER_OF_FREE_SPACE = 0.45;

// 시드 난수 — 같은 부모·같은 자식이면 언제나 같은 자리. 위치가 렌더마다 흔들리면 별이
// 춤을 춘다.
function jitter(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

// 자식들을 부모 원 안에 앉힌다. 호출자는 큰 것부터 정렬해서 넘긴다.
//
// 첫째(가장 큰 것)는 부모의 **한가운데**에 앉는다. 실제 은하단이 그렇게 생겼기도 하지만,
// 더 중요한 이유는 중심이 비어 있으면 안 되기 때문이다: 중심을 겨눠 확대하면 아무것도 없는
// 허공으로 떨어져 "확대할수록 풀린다"가 "확대하면 사라진다"가 된다.
// 지도 자리에 앉히기 — 시/도처럼 실제 위치가 있는 층에만 쓴다.
//
// 크기는 이웃까지의 거리에서 나온다. 지도 배치는 간격이 제멋대로라(수도권은 붙어 있고
// 제주는 멀리 떨어져 있다) 고정된 반지름을 주면 서울과 인천이 곧바로 겹친다.
export function placeOnMap(
  parent: SpacePlacement,
  points: (MapPoint | null)[],
  scales: number[],
): SpacePlacement[] {
  const reach = parent.radius * CHILD_FILL;
  const placed = points.map((point, index) => ({
    x: parent.x + (point?.x ?? 0) * reach,
    y: parent.y + (point?.y ?? 0) * reach,
    z: parent.z + jitter(index, 1.3) * parent.radius * DEPTH_SPREAD,
    radius: 0,
  }));
  const maxScale = scales.reduce((max, scale) => Math.max(max, scale), 0);

  return placed.map((body, index) => {
    let nearest = parent.radius;

    for (let other = 0; other < placed.length; other += 1) {
      if (other !== index) {
        nearest = Math.min(nearest, Math.hypot(body.x - placed[other].x, body.y - placed[other].y));
      }
    }

    const sizeFactor = maxScale > 0
      ? SIZE_FLOOR + (1 - SIZE_FLOOR) * Math.min(1, scales[index] / maxScale)
      : 1;

    return {
      ...body,
      // 이웃까지 거리의 절반 안쪽으로 잡되, 위아래를 묶는다. 지도 간격은 극단적으로
      // 불규칙해서(수도권은 붙어 있고 제주는 홀로 떨어져 있다) 비례만 시키면 서울은 점이
      // 되고 제주는 화면을 덮는다.
      radius: Math.max(
        parent.radius * 0.022,
        Math.min(parent.radius * 0.075, nearest * 0.42),
      ) * sizeFactor,
    };
  });
}

export function placeChildren(parent: SpacePlacement, scales: number[]): SpacePlacement[] {
  const count = scales.length;

  if (count === 0) {
    return [];
  }

  if (count === 1) {
    return [{ x: parent.x, y: parent.y, z: parent.z, radius: parent.radius * SINGLE_CHILD_RADIUS }];
  }

  const slots = buildOrbitSlots(count - 1);
  const ringCount = countRings(slots);
  const countByRing = new Map<number, number>();

  for (const slot of slots) {
    countByRing.set(slot.ring, (countByRing.get(slot.ring) ?? 0) + 1);
  }

  const span = parent.radius * CHILD_FILL;
  const ringGap = span / ringCount;
  const maxScale = scales.reduce((max, scale) => Math.max(max, scale), 0);
  const sizeFactorFor = (index: number) => (maxScale > 0
    ? SIZE_FLOOR + (1 - SIZE_FLOOR) * Math.min(1, scales[index] / maxScale)
    : 1);

  // 중심의 자식은 첫 궤도까지의 거리 안에 들어가야 한다 — 그 궤도의 이웃과 닿지 않게.
  const center: SpacePlacement = {
    x: parent.x,
    y: parent.y,
    z: parent.z,
    radius: ringGap * CHILD_CLEARANCE * sizeFactorFor(0),
  };

  return [
    center,
    ...slots.map((slot, slotIndex) => {
      const index = slotIndex + 1;
      const inRing = countByRing.get(slot.ring) ?? 1;
      const baseOrbit = ringGap * (slot.ring + 1);
      const angleStep = (Math.PI * 2) / inRing;
      // 이웃에게 줄 몫을 뺀 '빈 자리' 안에서만 흔든다.
      const reserved = ringGap * CHILD_CLEARANCE * 2;
      const radialFree = Math.max(0, ringGap - reserved);
      const angularFree = Math.max(0, angleStep - reserved / baseOrbit);
      // 흔들려도 궤도가 가장 바깥 테두리를 넘지 않게 묶는다 — 넘으면 자식이 부모 밖으로
      // 나가고, 그러면 '부모 밖이면 가지 전체를 건너뛴다'는 컬링 전제가 깨진다.
      const orbit = Math.max(
        ringGap * 0.5,
        Math.min(span, baseOrbit + jitter(index, 3.1) * radialFree * JITTER_OF_FREE_SPACE),
      );
      const angle = slot.angle + jitter(index, 7.7) * angularFree * JITTER_OF_FREE_SPACE;
      const angularGap = angleStep * orbit;
      // 세 가지 상한: 안팎 궤도와의 간격, 같은 궤도 이웃과의 간격, 그리고 부모의 테두리.
      // 마지막이 없으면 궤도가 하나뿐일 때(자식 2~7개) 자식이 부모 밖으로 삐져나간다.
      const room = Math.min(
        ringGap * CHILD_CLEARANCE,
        angularGap * CHILD_CLEARANCE,
        (parent.radius - orbit) * 0.98,
      );

      return {
        x: parent.x + Math.cos(angle) * orbit,
        y: parent.y + Math.sin(angle) * orbit,
        // 깊이 — 이것 때문에 어떤 천체는 앞에, 어떤 천체는 뒤에 놓인다. 화면에서 겹칠 수
        // 있게 되는 것이 핵심이다: 절대 안 겹치는 배치는 그 자체로 평면처럼 읽힌다.
        z: parent.z + jitter(index, 1.3) * parent.radius * DEPTH_SPREAD,
        radius: room * sizeFactorFor(index),
      };
    }),
  ];
}

// --- 화면 크기에 따른 해상 정도 -------------------------------------------------

// 이보다 작으면 그리지 않는다 — 한 점도 안 되는 것을 그려봐야 비용만 든다.
export const BODY_CULL_PX = 0.7;
// 화면 반지름이 이만큼 되면 안의 것들이 비치기 시작한다.
export const BODY_RESOLVE_PX = 46;
// 이만큼이면 완전히 풀렸다 — 뭉친 덩어리는 흔적만 남고 안의 것들이 주인공.
export const BODY_RESOLVED_PX = 150;
// 이름은 이 크기부터 읽을 만하다.
export const BODY_LABEL_PX = 10;

// 깊이에 따른 원근. 직교 카메라라 three가 대신 해 주지 않으므로 여기서 손으로 준다 —
// 가까운 것은 크고 밝게, 먼 것은 작고 어둡게. 이 한 가지가 '한 판 위에 늘어놓은 도표'와
// '앞뒤가 있는 하늘'을 가른다.
//
// 위치까지 밀어내지는 않는다: 화면 변환이 아핀(screen = 중심 + 좌표×배율 + 이동)으로
// 유지돼야 검색 착지·탭 이동이 좌표 하나로 성립한다. 크기와 밝기만으로도 앞뒤는 읽힌다.
const PERSPECTIVE_DISTANCE = 2.2;

// 부모 반지름으로 정규화한 깊이(-DEPTH_SPREAD ~ +DEPTH_SPREAD)를 배율로.
export function depthScaleFor(normalizedDepth: number): number {
  const clamped = Math.max(-0.9, Math.min(0.9, normalizedDepth));
  return PERSPECTIVE_DISTANCE / (PERSPECTIVE_DISTANCE - clamped);
}

// 먼 것은 흐려진다 — 사이의 성간 먼지가 하는 일.
export function depthDimFor(depthScale: number): number {
  return Math.max(0.55, Math.min(1.15, 0.35 + 0.65 * depthScale));
}

// 매끄러운 문턱 — 두 그림 방식 사이를 오갈 때 이 값으로 겹쳐 섞는다. 툭 바뀌면 확대가
// 연속이 아니라 '전환'으로 느껴진다 (오너 2026-08-16: "확대할 때 약간 이질적으로 변해서
// 들어가는 게 있어").
export function smoothStep(edge0: number, edge1: number, value: number): number {
  if (!Number.isFinite(value) || edge1 <= edge0) {
    return value >= edge1 ? 1 : 0;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// 0(뭉쳐 있음) ~ 1(완전히 풀림).
export function resolveProgress(screenRadius: number): number {
  if (!Number.isFinite(screenRadius) || screenRadius <= BODY_RESOLVE_PX) {
    return 0;
  }

  if (screenRadius >= BODY_RESOLVED_PX) {
    return 1;
  }

  return (screenRadius - BODY_RESOLVE_PX) / (BODY_RESOLVED_PX - BODY_RESOLVE_PX);
}

// 풀릴수록 옅어지되 완전히 사라지지는 않는다 — 그 별들이 '어느 은하에 속한 것인지'가 계속
// 보여야 하나의 공간으로 읽힌다.
export function cloudOpacity(progress: number): number {
  return 1 - 0.86 * Math.max(0, Math.min(1, progress));
}

// 이름은 풀리기 시작하면 물러난다 — 안의 이름들에게 자리를 내준다.
export function labelOpacity(progress: number): number {
  return 1 - Math.max(0, Math.min(1, progress / 0.55));
}

// 어떤 천체를 화면 가득 보고 싶을 때의 배율.
export function zoomToFrame(radius: number, canvasWidth: number, canvasHeight: number): number {
  if (radius <= 0) {
    return 1;
  }

  return ((Math.min(canvasWidth, canvasHeight) / 2) * 0.62) / radius;
}
