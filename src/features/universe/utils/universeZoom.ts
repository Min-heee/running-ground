import {
  panToHold,
  unprojectAt,
} from '@/features/universe/utils/universeProjection';
import {
  UNIVERSE_MAX_ZOOM_FACTOR,
  UNIVERSE_MIN_ZOOM_FACTOR,
} from '@/features/universe/utils/universeSpace';

// 확대/축소의 계산만. react-native에 손대지 않는 순수 함수라 테스트가 훅을 통째로 불러오지
// 않아도 된다 — 훅에 두면 테스트가 react-native/index.js를 파싱하다 죽는다.

export type UniverseViewport = {
  zoom: number;
  panX: number;
  panY: number;
  // 카메라가 지금 지나고 있는 깊이. 확대해 들어갈수록 파고든 층의 깊이를 따라간다 —
  // 이게 없으면 앞쪽 천체를 통과하지 못하고 영영 그 앞에 멈춰 있게 된다.
  camDepth: number;
};

// 확대 앵커 아래에 있는 천체 — 화면이 알려준다. 확대는 곧 그리로 다가가는 일이라,
// 카메라의 깊이와 이동량을 이 천체를 기준으로 정한다.
export type AnchorTarget = {
  x: number;
  y: number;
  z: number;
  // 커서·손가락이 **실제로 그 천체 위에** 있는가. 빈 하늘이면 false — 그때는 깊이의
  // 길잡이로만 쓰고, 화면에 붙들지는 않는다.
  onBody: boolean;
};

export function clampZoomTo(zoom: number, fitZoom: number): number {
  return Math.min(
    fitZoom * UNIVERSE_MAX_ZOOM_FACTOR,
    Math.max(fitZoom * UNIVERSE_MIN_ZOOM_FACTOR, zoom),
  );
}

// 한 점(앵커)을 화면에 고정한 채 배율만 바꾼다 — 커서/손가락 아래가 안 밀리는 확대.
export function zoomAroundPoint(
  viewport: UniverseViewport,
  nextZoomRaw: number,
  anchorX: number,
  anchorY: number,
  canvasWidth: number,
  canvasHeight: number,
  fitZoom: number,
  anchor: AnchorTarget | null,
): UniverseViewport {
  const nextZoom = clampZoomTo(nextZoomRaw, fitZoom);
  const ratio = nextZoom / viewport.zoom;

  // 겨눈 깊이 — 커서가 천체 위면 그 천체의 깊이, 빈 하늘이면 지금의 초점면.
  const aimDepth = anchor?.onBody ? anchor.z : viewport.camDepth;

  // 카메라는 **겨눈 깊이까지의 거리를 배율에 반비례로** 좁힌다: (camDepth - z)·zoom 이 불변.
  // 확대하면 다가가고 축소하면 정확히 그 역으로 물러난다 — 그래서 굴린 만큼 되돌아온다.
  //
  // 예전엔 축소를 따로 다뤄 camDepth를 0쪽으로 끌었는데, 그건 겨눈 것과 아무 관계없는
  // 절대 깊이라 한 칸만 축소해도 보고 있던 것이 카메라 뒤로 떨어졌다.
  const camDepth = aimDepth + (viewport.camDepth - aimDepth) / ratio;
  const moved = { ...viewport, camDepth, zoom: nextZoom };

  // 붙드는 것은 **커서 아래의 그 자리**다. 천체를 겨눴으면 그 천체의 깊이에서, 빈 하늘이면
  // 초점면에서 커서를 역투영한 점.
  //
  // 천체의 '중심'을 붙들면 안 된다: 중심은 대개 커서 아래가 아니라서, 첫 칸에 그 천체가
  // 커서로 순간이동하며 장면 전체가 반지름만큼 튄다 — 겨눈 곳이 아니라 엉뚱한 방향으로
  // 밀리는 것처럼 보인다.
  //
  // 역투영은 반드시 공용 함수를 쓴다. 예전에 여기 손으로 베껴 둔 사본이 y 부호만 옛날 것으로
  // 남아, 투영 쪽을 고친 뒤에도 이 경로만 계속 어긋나 있었다.
  const held = panToHold(
    unprojectAt(anchorX, anchorY, viewport, canvasWidth, canvasHeight, aimDepth),
    anchorX,
    anchorY,
    moved,
    canvasWidth,
    canvasHeight,
  );

  return { ...moved, panX: held.panX, panY: held.panY };
}
