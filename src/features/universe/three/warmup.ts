import { listSkyTextureBakes } from '@/features/universe/three/planetTextures';
import { getPendingDiskBuildCount, setDiskBuildWarmup } from '@/features/universe/three/GalaxyDisk';

// 진입 준비 (오너 2026-08-23: "처음 탭 들어가고 접속을 하다가 좀 지나면 괜찮아지네, 그럼
// 로딩중으로 초반 시간을 버는 게 나을 것 같은데").
//
// 계측이 그 말을 뒷받침한다: fps는 내내 57~60인데 **최악 프레임만** 17→28→42ms로 튀고,
// 그 값이 화면의 원반 수를 따라갔다. 즉 정상 부하가 아니라 처음 한 번 치르는 준비 비용이
// 사용자의 손가락 밑에서 터지고 있었다. 그 비용을 로딩 화면 뒤로 옮긴다 — 없애는 게 아니라
// **보이지 않는 곳에서** 치른다.
//
// 기다리는 것은 첫 화면이 실제로 쓰는 것들뿐이다. 행성 표면처럼 한참 들어가야 쓰는 것은
// 로딩을 잡지 않고 뒤에서 계속 구워진다.

const MIN_HOLD_MS = 350;
// 아무리 느린 기기라도 여기서 더 붙잡지 않는다 — 준비가 덜 됐어도 화면은 보여준다.
const MAX_HOLD_MS = 4000;

export type WarmupHandle = { cancel: () => void };

export function runSpaceWarmup(onReady: () => void): WarmupHandle {
  const startedAt = Date.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  setDiskBuildWarmup(true);

  const finish = () => {
    if (cancelled) {
      return;
    }

    cancelled = true;

    if (timer !== null) {
      clearTimeout(timer);
    }

    setDiskBuildWarmup(false);
    onReady();
  };

  // 텍스처는 한 프레임에 한 장씩 굽는다. 로딩 표시도 결국 같은 스레드에서 도니까,
  // 한꺼번에 구우면 스피너까지 멎어 '멈춘 앱'으로 보인다.
  const bakes = listSkyTextureBakes();
  let baked = 0;

  const tick = () => {
    if (cancelled) {
      return;
    }

    if (baked < bakes.length) {
      bakes[baked]();
      baked += 1;
    }

    const elapsed = Date.now() - startedAt;
    const ready = baked >= bakes.length && getPendingDiskBuildCount() === 0;

    if (elapsed >= MAX_HOLD_MS || (ready && elapsed >= MIN_HOLD_MS)) {
      finish();
      return;
    }

    timer = setTimeout(tick, 16);
  };

  timer = setTimeout(tick, 0);

  return { cancel: finish };
}
