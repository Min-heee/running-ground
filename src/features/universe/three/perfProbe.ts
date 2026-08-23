// 스페이스 탭 성능 계측 — 실기기에서 **어디가 비싼지** 숫자로 보기 위한 것.
//
// 오너 폰에서 세 번 "버벅인다"는 보고를 받았고, 개발 브라우저는 탭이 가려지면 프레임 루프가
// 얼어서 측정이 통째로 오염된다(이 세션에서 두 번 겪었다). 추측으로 깎는 대신 재기로 한다.
// 화면에 뜨는 건 제목을 길게 눌렀을 때뿐이라 평소에는 아무 비용도, 아무 흔적도 없다.

export type PerfSnapshot = {
  fps: number;
  // 최근 1초 안에서 가장 길었던 한 프레임 — 평균이 좋아도 이게 크면 '버벅'으로 느껴진다.
  worstMs: number;
  // 프레임 루프가 도는 동안 그린 천체/원반 수.
  bodies: number;
  disks: number;
  // 실제로 칠하는 픽셀 수와 기기 픽셀 배율 — GPU 쪽 부담의 크기.
  megaPixels: number;
  dpr: number;
};

const WINDOW_MS = 1000;
const samples: { at: number; ms: number }[] = [];
let lastFrameAt = 0;
let sceneBodies = 0;
let sceneDisks = 0;
let canvasMegaPixels = 0;
let canvasDpr = 1;

export function recordFrame(nowMs: number) {
  if (lastFrameAt > 0) {
    samples.push({ at: nowMs, ms: nowMs - lastFrameAt });
  }

  lastFrameAt = nowMs;

  while (samples.length > 0 && nowMs - samples[0].at > WINDOW_MS) {
    samples.shift();
  }
}

export function recordScene(bodies: number, disks: number) {
  sceneBodies = bodies;
  sceneDisks = disks;
}

export function recordCanvas(widthPx: number, heightPx: number, dpr: number) {
  canvasMegaPixels = (widthPx * heightPx * dpr * dpr) / 1_000_000;
  canvasDpr = dpr;
}

export function readPerf(): PerfSnapshot {
  const worstMs = samples.reduce((worst, sample) => Math.max(worst, sample.ms), 0);
  const totalMs = samples.reduce((sum, sample) => sum + sample.ms, 0);

  return {
    fps: totalMs > 0 ? Math.round((samples.length / totalMs) * 1000) : 0,
    worstMs: Math.round(worstMs),
    bodies: sceneBodies,
    disks: sceneDisks,
    megaPixels: Math.round(canvasMegaPixels * 10) / 10,
    dpr: canvasDpr,
  };
}
