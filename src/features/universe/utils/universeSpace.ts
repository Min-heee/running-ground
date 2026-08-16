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

// 부모 반지름 중 자식들이 쓰는 몫. 나머지는 가장자리 여백 — 원반 팔이 부모 밖으로 삐져나가
// 이웃과 섞이지 않게 한다.
const CHILD_FILL = 0.74;
// 자식 반지름 상한 = (궤도 간격, 같은 궤도의 각도 간격) 중 좁은 쪽 × 이 비율. 형제끼리
// 겹치지 않게 하는 유일한 장치다.
const CHILD_CLEARANCE = 0.44;
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
// 위쪽이 이렇게 큰 건 이 공간이 4겹이기 때문이다 — 나라를 담은 상태에서 한 사람의 행성까지
// 가려면 수백 배가 필요하다.
export const UNIVERSE_MAX_ZOOM_FACTOR = 600;

// 나라 전체가 화면에 들어차는 배율.
export function fitZoomFor(canvasWidth: number, canvasHeight: number): number {
  const half = Math.min(canvasWidth, canvasHeight) / 2;

  return half > 0 ? (half * 0.92) / UNIVERSE_ROOT_RADIUS : 1;
}

export type SpacePlacement = {
  x: number;
  y: number;
  radius: number;
};

// 자식들을 부모 원 안에 앉힌다. 호출자는 큰 것부터 정렬해서 넘긴다.
//
// 첫째(가장 큰 것)는 부모의 **한가운데**에 앉는다. 실제 은하단이 그렇게 생겼기도 하지만,
// 더 중요한 이유는 중심이 비어 있으면 안 되기 때문이다: 중심을 겨눠 확대하면 아무것도 없는
// 허공으로 떨어져 "확대할수록 풀린다"가 "확대하면 사라진다"가 된다.
export function placeChildren(parent: SpacePlacement, scales: number[]): SpacePlacement[] {
  const count = scales.length;

  if (count === 0) {
    return [];
  }

  if (count === 1) {
    return [{ x: parent.x, y: parent.y, radius: parent.radius * SINGLE_CHILD_RADIUS }];
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
    radius: ringGap * CHILD_CLEARANCE * sizeFactorFor(0),
  };

  return [
    center,
    ...slots.map((slot, slotIndex) => {
      const index = slotIndex + 1;
      const orbit = ringGap * (slot.ring + 1);
      const inRing = countByRing.get(slot.ring) ?? 1;
      const angularGap = (Math.PI * 2 * orbit) / inRing;
      // 세 가지 상한: 안팎 궤도와의 간격, 같은 궤도 이웃과의 간격, 그리고 부모의 테두리.
      // 마지막이 없으면 궤도가 하나뿐일 때(자식 2~7개) 자식이 부모 밖으로 삐져나간다.
      const room = Math.min(
        ringGap * CHILD_CLEARANCE,
        angularGap * CHILD_CLEARANCE,
        (parent.radius - orbit) * 0.98,
      );

      return {
        x: parent.x + slot.unitX * orbit,
        y: parent.y + slot.unitY * orbit,
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
