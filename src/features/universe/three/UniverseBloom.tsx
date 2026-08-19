import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from 'postprocessing';
import { Uniform } from 'three';

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
const LUMINANCE_THRESHOLD = 0.93;
// 문턱 근처를 부드럽게 — 낮으면 번지는 영역의 경계가 눈에 보인다.
const LUMINANCE_SMOOTHING = 0.1;
const INTENSITY = 1.6;

// **번지는 반경을 정하는 건 이 값이다.** mipmapBlur를 켜면 kernelSize는 조용히 무시되므로
// (예전에 KernelSize.LARGE를 넘기던 건 아무 일도 하지 않았다), 밉 단계 수가 곧 반경이다.
// 기본값 8이면 가장 거친 밉이 화면의 1/256이고 그걸 화면 전체로 늘려 더한다 — 밝은 것 하나가
// 화면 절반에 옅게 발린다. 블룸은 밝은 것에 **붙어** 있어야 눈부심으로 읽힌다.
const LEVELS = 3;
// 밉을 겹칠 때의 번짐 폭. 낮출수록 후광이 코어에 붙는다.
const RADIUS = 0.62;

// 사진 마감 — 블룸과 **같은 EffectPass에 융합**된다(postprocessing은 한 패스의 이펙트를
// 셰이더 하나로 합친다). 렌더 타깃이 늘지 않으므로 비용은 픽셀당 산술 몇 개뿐이다.
//
// 어둠 규칙과의 관계: 여기의 여섯 단계 중 둘(비네트·블랙 크러시)은 화면을 **어둡게** 하고,
// 나머지는 광량 중립이다. 특히 디더는 검은 하늘의 8비트 밴딩(코로나·핵 주위의 동심원 띠 —
// 어두운 화면에서 가장 크게 '프로그래머 아트'로 읽히는 결함)을 지운다. 순수한 검정(휘도
// 0.12 미만의 바닥)은 건드리지 않도록 게이트를 건다 — 바닥까지 흔들면 노이즈가 된다.
const GRADE_FRAGMENT = `
uniform float uTime;

float gradeHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;

  // 필믹 숄더 — 밝은 핵이 뚝 잘리는 대신 흰색으로 굴러 넘어간다.
  c = c / (1.0 + 0.35 * max(vec3(0.0), c - vec3(0.78)));

  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // 중간톤만 살짝 진하게 — 은하 팔의 파랑, 핵의 온기가 한 걸음 앞으로.
  c = mix(vec3(lum), c, 1.08);
  // 그림자를 차갑게 — 팔레트 규율(차가운 은청색 우주)을 화면 전역에서 강제한다.
  c *= mix(vec3(0.93, 0.97, 1.07), vec3(1.0), smoothstep(0.0, 0.22, lum));

  // 비네트 — 가장자리를 눌러 화면에 무게 중심을 만든다. 장노출 사진의 문법.
  vec2 q = uv - 0.5;
  c *= 1.0 - 0.28 * smoothstep(0.30, 0.80, dot(q, q) * 2.6);

  // 블랙 크러시 — 바닥을 진짜 0에 못박는다. 가산합성 찌꺼기가 남긴 거의-검정을 지운다.
  c = max(vec3(0.0), c - 0.003);

  // 휘도 게이트를 건 삼각 디더 — 밴딩이 사는 어두운 경사면에만 ±0.9/255를 뿌린다.
  float dither = (gradeHash(uv * 913.7 + fract(uTime) * 17.0) - 0.5) * (1.8 / 255.0);
  c += dither * smoothstep(0.0, 0.12, lum);

  outputColor = vec4(c, inputColor.a);
}
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAGMENT, {
      uniforms: new Map<string, Uniform>([['uTime', new Uniform(0)]]),
    });
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime?: number): void {
    const time = this.uniforms.get('uTime');

    if (time) {
      time.value = (time.value + (deltaTime ?? 0)) % 64;
    }
  }
}

export function UniverseBloom() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const composer = useMemo(() => {
    const instance = new EffectComposer(gl);
    instance.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({
      intensity: INTENSITY,
      luminanceThreshold: LUMINANCE_THRESHOLD,
      luminanceSmoothing: LUMINANCE_SMOOTHING,
      // 밉맵 기반이라 반경을 싸게 얻는다 — 커널을 키우는 것보다 훨씬 가볍다.
      mipmapBlur: true,
      levels: LEVELS,
      radius: RADIUS,
    });
    // 블룸 뒤에 마감을 건다 — 같은 EffectPass라 셰이더 하나로 융합되고, 블룸이 만든
    // 그라데이션까지 디더가 다듬는다. 패스는 여전히 둘뿐이다(Render + Effect).
    instance.addPass(new EffectPass(camera, bloom, new GradeEffect()));

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
