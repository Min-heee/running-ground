import { listAllTextureBakes } from '@/features/universe/three/planetTextures';
import { getPendingDiskBuildCount, setDiskBuildWarmup } from '@/features/universe/three/GalaxyDisk';

// 진입 준비 (오너 2026-08-23: "처음 탭 들어가고 접속을 하다가 좀 지나면 괜찮아지네, 그럼
// 로딩중으로 초반 시간을 버는 게 나을 것 같은데").
//
// 계측이 그 말을 뒷받침한다: fps는 내내 57~60인데 **최악 프레임만** 17→28→42ms로 튀고,
// 그 값이 화면의 원반 수를 따라갔다. 즉 정상 부하가 아니라 처음 한 번 치르는 준비 비용이
// 사용자의 손가락 밑에서 터지고 있었다. 그 비용을 로딩 화면 뒤로 옮긴다 — 없애는 게 아니라
// **보이지 않는 곳에서** 치른다.
//
// 2026-08-25 개정: 이제 **전부** 기다린다. 예전엔 하늘 텍스처 7장만 굽고 행성 표면류
// 26장은 마운트+2초부터 절대시각 타이머(400ms 간격)로 흩뿌렸는데, Hermes에서 장당
// 350-800ms짜리 베이크가 슬롯을 전부 초과하자 RN이 밀린 타이머들을 **한 프레임에 몰아**
// 실행해 첫 조작 밑에서 1128ms/2254ms 단일 프레임이 터졌다(오너 영상 실측, 바디/디스크
// 카운트 불변이 그 서명이다). 오너 결정: "로딩을 길게 가져가도 괜찮다" — 그래서 무거운
// 베이크 전체를 이 홀드 안으로 옮기고, 상한에 잘린 꼬리만 CelestialSphere의 연쇄
// 드레인(한 번에 한 장, 절대 몰리지 않음)이 이어 굽는다.

const MIN_HOLD_MS = 350;
// 아무리 느린 기기라도 여기서 더 붙잡지 않는다 — 준비가 덜 됐어도 화면은 보여준다.
// 전체 베이크(하늘 10 + 행성류 19)가 아이폰에서 4-8초 감이라 10초면 넉넉하고, 잘려도
// 목록이 싼 것부터라 제일 무거운 꼬리만 남는다.
const MAX_HOLD_MS = 10000;

// CelestialSphere의 잔여 드레인이 홀드와 같은 프레임에 겹쳐 굽지 않게 참조하는 플래그.
let warmupHolding = false;

export function isSpaceWarmupHolding() {
  return warmupHolding;
}

export type WarmupHandle = { cancel: () => void };

export function runSpaceWarmup(onReady: () => void): WarmupHandle {
  const startedAt = Date.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  setDiskBuildWarmup(true);
  warmupHolding = true;

  const finish = () => {
    if (cancelled) {
      return;
    }

    cancelled = true;
    warmupHolding = false;

    if (timer !== null) {
      clearTimeout(timer);
    }

    setDiskBuildWarmup(false);
    onReady();
  };

  // 텍스처는 한 프레임에 한 장씩 굽는다. 로딩 표시도 결국 같은 스레드에서 도니까,
  // 한꺼번에 구우면 스피너까지 멎어 '멈춘 앱'으로 보인다.
  const bakes = listAllTextureBakes();
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
