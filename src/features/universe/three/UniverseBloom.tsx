import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass,
} from 'postprocessing';

// 블룸 (오너 2026-08-16: "블룸 해주고"). 밝은 것 주위로 빛이 번지는 효과 — 우주 사진이
// 우주처럼 보이는 이유의 절반이다. 항성의 광구, 은하 핵, 행성 대기 테두리처럼 이미 밝게
// 그려진 곳이 실제로 눈부시게 된다.
//
// **웹 전용**이다. 이 파일은 UniverseCanvas.tsx(웹)에서만 불리고 .native.tsx는 부르지
// 않는다 — postprocessing은 렌더 타깃을 여러 장 잡는데 expo-gl에서의 동작이 검증되지
// 않았고, 우주는 사이트로 나가므로 웹만 챙기면 된다.
//
// @react-three/postprocessing(리액트 래퍼)을 안 쓰는 이유: 그 패키지가 react ^19.2를
// 요구하는데 Expo SDK 54가 react를 19.1로 고정한다. 래퍼 없이 직접 조립하면 peer 충돌이
// 없고, 어차피 여기서 필요한 건 패스 두 개뿐이다.

// 이 밝기를 넘는 부분만 번진다. 0.42로 잡았더니 배경 성운까지 번져 화면 전체가 보랏빛으로
// 떠올랐다 — 검은 하늘이 검게 남아야 밝은 것이 밝아 보인다.
const LUMINANCE_THRESHOLD = 0.72;
// 문턱 근처를 부드럽게 — 낮으면 번지는 영역의 경계가 눈에 보인다.
const LUMINANCE_SMOOTHING = 0.28;
const INTENSITY = 1.05;

export function UniverseBloom() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const composer = useMemo(() => {
    const instance = new EffectComposer(gl);
    instance.addPass(new RenderPass(scene, camera));
    instance.addPass(new EffectPass(camera, new BloomEffect({
      intensity: INTENSITY,
      luminanceThreshold: LUMINANCE_THRESHOLD,
      luminanceSmoothing: LUMINANCE_SMOOTHING,
      // 밉맵 기반이라 큰 반경을 싸게 얻는다 — 커널을 키우는 것보다 훨씬 가볍다.
      mipmapBlur: true,
      kernelSize: KernelSize.LARGE,
    })));

    return instance;
  }, [camera, gl, scene]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, dpr, size.height, size.width]);

  // 다 쓰면 렌더 타깃을 반납한다 — 화면을 오갈 때마다 GPU 메모리가 쌓이면 안 된다.
  useEffect(() => () => composer.dispose(), [composer]);

  // 우선순위를 주면 r3f가 기본 렌더를 넘기고 이쪽이 그린다.
  useFrame(() => {
    composer.render();
  }, 1);

  return null;
}
