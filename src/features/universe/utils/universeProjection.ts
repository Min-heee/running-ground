// 원근 투영 (오너 2026-08-16: "원근 카메라로 가고").
//
// three의 카메라에 맡기지 않고 여기서 직접 투영한다. 이름표와 터치 영역은 RN View라
// 3D가 아니라 화면 좌표가 필요한데, 두 레이어가 각자 투영하면 반드시 어긋난다. 그래서
// **여기 한 곳**에서만 좌표를 만들고 3D도 그 결과를 받아 그린다.
//
// 카메라는 z축 위에 있고 -z를 본다. 초점면(z = camDepth + 카메라거리)에 놓인 것은 예전
// 직교 투영과 정확히 같은 자리·같은 크기로 나온다:
//   거리 = focal / zoom 일 때, z = camDepth 인 천체는 screen = 중심 + 좌표×zoom + 이동
// 그래서 깊이가 0인 세계는 이전과 완전히 동일하게 그려지고, 깊이가 생긴 것만 앞뒤로
// 벌어진다 — 옮겨오면서 화면이 통째로 달라지는 일이 없다.

export type Camera = {
  // 초점면에서의 배율(픽셀/우주단위) — 예전의 zoom과 같은 뜻.
  zoom: number;
  panX: number;
  panY: number;
  // 카메라가 지금 어느 깊이를 지나고 있는지. 확대해 들어갈수록 따라 들어간다.
  camDepth: number;
};

export type Projected = {
  screenX: number;
  screenY: number;
  // 이 천체에 적용된 배율(픽셀/우주단위). 반지름에 곱하면 화면 반지름이다.
  scale: number;
  // 카메라 앞이 아니면 그릴 수 없다.
  visible: boolean;
};

// 화면 절반 높이 대비 초점거리. 클수록 원근이 약해진다(직교에 가까워지고), 작을수록
// 과장된다. 1.9는 화각 55° 정도 — 우주 사진의 광각 느낌은 나되 가장자리가 휘지 않는다.
const FOCAL_RATIO = 1.9;
// 카메라 코앞은 그리지 않는다 — 0으로 나누는 것과 같아 좌표가 폭발한다.
const MIN_VIEW_DEPTH_RATIO = 0.06;

export function focalLengthFor(canvasHeight: number): number {
  return (canvasHeight / 2) * FOCAL_RATIO;
}

// 카메라에서 초점면까지의 거리(우주 단위). 배율이 커질수록 가까이 간다.
export function cameraDistanceFor(camera: Camera, canvasHeight: number): number {
  return focalLengthFor(canvasHeight) / Math.max(1e-6, camera.zoom);
}

export function projectPoint(
  x: number,
  y: number,
  z: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): Projected {
  const focal = focalLengthFor(canvasHeight);
  const distance = focal / Math.max(1e-6, camera.zoom);
  // 카메라는 초점면보다 distance만큼 앞(+z)에 있다.
  const viewDepth = camera.camDepth + distance - z;

  if (viewDepth < distance * MIN_VIEW_DEPTH_RATIO) {
    return { screenX: 0, screenY: 0, scale: 0, visible: false };
  }

  const scale = focal / viewDepth;
  // pan은 화면 픽셀 단위의 카메라 이동이다. 초점면에서 예전과 같은 양만큼 움직이도록
  // 우주 단위로 되돌린 뒤(÷zoom) 다시 이 천체의 배율로 투영한다 — 그래서 가까운 것이
  // 먼 것보다 더 많이 흐른다(시차).
  //
  // 두 축의 부호는 **같다**. 화면 좌표계의 y가 아래로 증가한다는 사실은 이미 배치가 그렇게
  // 만들어져 있어서(우주 y도 아래가 +) 여기서 다시 뒤집으면 안 된다. 한쪽만 뒤집혀 있던
  // 동안 x는 정확히 가운데에 오는데 y만 수십만 픽셀 밖으로 나갔다 — '내 행성으로'가 허공에
  // 내려앉고, 확대해도 겨눈 곳으로 안 가지던 것이 전부 이 한 글자였다.
  const camX = -camera.panX / camera.zoom;
  const camY = -camera.panY / camera.zoom;

  return {
    screenX: canvasWidth / 2 + (x - camX) * scale,
    screenY: canvasHeight / 2 + (y - camY) * scale,
    scale,
    visible: true,
  };
}

// 확대해도 앵커 아래의 **그 천체**가 제자리에 머물도록 이동량을 역산한다.
//
// 원근에서는 아핀 시절의 공식이 통하지 않는다. 그때는 모든 것이 한 평면에 있어 배율만
// 곱하면 됐지만, 지금은 천체마다 깊이가 달라 화면 위 움직임이 제각각이다. 초점면 기준으로
// 고정하면 깊이가 다른 천체는 확대할 때마다 조금씩 미끄러지고, 스무 번쯤 굴리면 겨눴던
// 것이 화면 밖으로 사라진다.
export function panToHold(
  target: { x: number; y: number; z: number },
  anchorScreenX: number,
  anchorScreenY: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): { panX: number; panY: number } {
  const focal = focalLengthFor(canvasHeight);
  const viewDepth = camera.camDepth + focal / Math.max(1e-6, camera.zoom) - target.z;
  const scale = focal / Math.max(1e-6, viewDepth);

  return {
    panX: ((anchorScreenX - canvasWidth / 2) / scale - target.x) * camera.zoom,
    panY: ((anchorScreenY - canvasHeight / 2) / scale - target.y) * camera.zoom,
  };
}

// 화면의 한 점이 초점면(z = camDepth)에서 어느 우주 좌표인지 — 확대 앵커를 잡을 때 쓴다.
export function unprojectOnFocalPlane(
  screenX: number,
  screenY: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (screenX - canvasWidth / 2) / camera.zoom - camera.panX / camera.zoom,
    y: (screenY - canvasHeight / 2) / camera.zoom - camera.panY / camera.zoom,
  };
}
