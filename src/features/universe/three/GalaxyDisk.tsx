import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  ShaderMaterial,
} from 'three';

import {
  dustLaneStrength,
  getDustLaneTexture,
  getStarPointTexture,
  SPIRAL_BRANCHES,
  SPIRAL_SPIN,
} from '@/features/universe/three/textures';
import { HighlightRing } from '@/features/universe/three/HighlightRing';
import { smoothStep } from '@/features/universe/utils/universeSpace';

// 나선은하 (오너 2026-08-15: "은하가 저렇게 생기진 않았잖아"). 발광하는 공이 아니라 실제
// 은하의 형태 — 밝은 핵 + 로그나선 팔 + 얇은 원반 + 기울기 — 를 파티클로 만든다.
//
// 2026-08-19 대개편: 천체사진이 진짜로 보이는 이유를 넣었다.
//  - 별 크기의 멱법칙 — 수천 개는 희미하고 몇 개만 눈부시다. 균일한 점 크기가 '프로그래머
//    아트'로 읽히는 가장 큰 이유였다.
//  - 항성 종족 — 따뜻한 늙은 벌지, 푸른 젊은 팔, 팔 위의 분홍 HII 매듭, 원반 밖의 옅은 헤일로.
//  - 먼지 띠 — 가산이 아니라 **일반 합성으로 뒤의 빛을 삼키는** 판. 띠 안의 별은 실제
//    성간 소광처럼 어두워지고 붉어진다.
//  - 시드 비대칭 — 한쪽으로 치우친 원반, 팔마다 다른 밝기. 완벽한 대칭은 도표로 읽힌다.
// 전부 빌드 타임(지오메트리 생성 시)에 계산되고, 프레임 루프는 유니폼만 만진다.
//
// 층마다 형태가 다르다: 은하(시/군/구)는 나선, 은하군(시/도)은 여러 은하가 모인 타원형
// 무리. 층이 바뀌면 생김새가 바뀌므로 지금 어느 층에 있는지가 눈으로도 읽힌다.

// 팔에서 흩어지는 정도 — 0이면 실처럼 가늘어 부자연스럽다.
const RANDOMNESS = 0.42;
const RANDOMNESS_POWER = 2.8;
// 파티클 예산 중 헤일로(원반 밖 구형 껍질의 늙은 별들)가 쓰는 몫.
const HALO_SHARE = 0.07;

function seeded(seed: number) {
  let value = seed % 2147483647;

  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

type DiskKind = 'galaxy' | 'group';

// 종족 색 — 벌지는 따뜻한 늙은 별, HII는 수소가 내는 분홍, 헤일로는 바랜 금빛.
const BULGE_INNER = new Color('#FFE9C8');
const BULGE_OUTER = new Color('#FFD9A0');
const HII_PINK = new Color('#FF8FA8').multiplyScalar(1.15);
const HALO_TINT = new Color('#C8B79A').multiplyScalar(0.25);
const GLOBULAR_TINT = new Color('#FFF2DC').multiplyScalar(0.8);

function buildDiskGeometry({
  count,
  radius,
  kind,
  seed,
  coreColor,
  armColor,
}: {
  count: number;
  radius: number;
  kind: DiskKind;
  seed: number;
  coreColor: Color;
  armColor: Color;
}): BufferGeometry {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const phases = new Float32Array(count);
  const mixed = new Color();

  // 은하 단위의 비대칭 — 시드에서 한 번만 뽑아 원반 전체가 공유한다. 같은 지역은 언제나
  // 같은 쪽으로 치우친, 같은 팔이 밝은 은하다.
  const lopPhase = random() * Math.PI * 2;
  const lopAmp = 0.08 + random() * 0.09;
  const branchGain = [0.85 + random() * 0.1, 1, 1.05 + random() * 0.12];

  const haloCount = kind === 'galaxy' ? Math.floor(count * HALO_SHARE) : 0;
  const diskCount = count - haloCount;

  for (let index = 0; index < diskCount; index += 1) {
    // 중심으로 갈수록 조밀 — 제곱근 분포라 핵이 밝고 바깥이 성기다.
    const distance = Math.pow(random(), 0.62) * radius;
    const branchIndex = index % SPIRAL_BRANCHES;
    const branchAngle = (branchIndex / SPIRAL_BRANCHES) * Math.PI * 2;
    const spinAngle = kind === 'galaxy' ? distance * (SPIRAL_SPIN / radius) : 0;

    const scatter = () =>
      Math.pow(random(), RANDOMNESS_POWER) * (random() < 0.5 ? 1 : -1) * RANDOMNESS * distance;

    const scatterX = scatter();
    const scatterY = scatter();
    const scatterZ = scatter();

    // 은하군은 팔이 없다 — 구성원이 공통 중심을 도는 타원형 무리라 각도를 무작위로 흩는다.
    const angle = kind === 'galaxy'
      ? branchAngle + spinAngle
      : random() * Math.PI * 2;
    const flatten = kind === 'galaxy' ? 0.14 : 0.55;
    // 치우침 — 원반의 한쪽이 다른 쪽보다 뻗는다. 실제 은하 대부분이 그렇다(lopsidedness).
    const lop = kind === 'galaxy' ? 1 + lopAmp * Math.sin(angle + lopPhase) : 1;
    const finalDistance = distance * lop;

    const px = Math.cos(angle) * finalDistance + scatterX;
    const py = Math.sin(angle) * finalDistance + scatterY;

    positions[index * 3] = px;
    positions[index * 3 + 1] = py;
    // 두께는 화면 깊이 방향(z)으로만 — 원반이 화면과 나란해 정면으로 보인다.
    positions[index * 3 + 2] = scatterZ * flatten;

    // 치우침이 반지름 밖으로 밀어낸 별까지 서서히 꺼지도록 상한을 1.15로 늘린다.
    const reach = Math.min(1.15, finalDistance / radius);
    // 가장자리는 서서히 꺼진다. 밀도만으로 끝을 내면 반지름에서 딱 잘려서, 멀어져 점들이
    // 한 덩어리로 뭉쳤을 때 은하가 아니라 **오려낸 회색 원**으로 보인다.
    const rim = 1 - Math.max(0, (reach - 0.5) / 0.65) ** 1.7;

    // 별 크기의 멱법칙 — 대부분 0.6 근처, 아주 드물게 3을 넘는다. 눈은 이 위계를
    // '진짜 별밭'으로 읽는다. 밝은 소수만 블룸 문턱을 넘어 바늘끝처럼 반짝인다.
    let size = 0.6 + 2.8 * Math.pow(random(), 6);
    let twinkle = 0.15 + random() * 0.3;

    const colorReach = Math.min(1, reach);
    // 팔 위에 앉은 점인지 — 흩어짐이 작으면 팔의 능선이다.
    const onArm = Math.abs(scatterX) + Math.abs(scatterY) < 0.05 * Math.max(1e-6, distance);

    if (kind === 'galaxy' && colorReach < 0.25) {
      // 벌지 — 늙고 따뜻한 별들. 거의 깜빡이지 않는다.
      mixed.copy(BULGE_INNER).lerp(BULGE_OUTER, colorReach / 0.25);
      twinkle = 0.1;
    } else if (
      kind === 'galaxy'
      && onArm
      && colorReach >= 0.3
      && colorReach <= 0.9
      && random() < 0.05
    ) {
      // HII 영역 — 팔 능선에 꿰인 분홍 진주. 별이 태어나는 자리라 크고 또렷하다.
      mixed.copy(HII_PINK);
      size = 1.6 + random() * 0.6;
      twinkle = 0.5;
    } else {
      mixed.copy(coreColor).lerp(armColor, colorReach);
      // 중간 반지름은 채도를 낮춘다 — 핵의 온기와 팔끝의 파랑 사이에 잿빛 계곡이 있어야
      // 두 색이 한 그라데이션의 양 끝이 아니라 서로 다른 종족으로 읽힌다.
      const desat = 0.25 * Math.max(0, 1 - Math.abs(colorReach - 0.5) * 2);
      const luminance = mixed.r * 0.2126 + mixed.g * 0.7152 + mixed.b * 0.0722;
      mixed.lerp(new Color(luminance, luminance, luminance), desat);
    }

    mixed.multiplyScalar(rim * (kind === 'galaxy' ? branchGain[branchIndex % branchGain.length] : 1));

    // 성간 소광 — 먼지 띠 안의 별은 어두워지고 붉어진다. 띠 텍스처와 같은 함수를 읽으므로
    // 별과 먼지가 정확히 같은 자리에서 만난다.
    if (kind === 'galaxy') {
      const lane = dustLaneStrength(px / radius, py / radius);

      if (lane > 0.01) {
        const dark = 1 - 0.5 * lane;
        mixed.r *= dark * (1 - lane * 0.1);
        mixed.g *= dark * (1 - lane * 0.28);
        mixed.b *= dark * (1 - lane * 0.4);
      }
    }

    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
    sizes[index] = size;
    twinkles[index] = twinkle;
    phases[index] = random();
  }

  // 헤일로 — 원반을 감싸는 구형 껍질의 늙은 별들과 구상성단 몇 개. 원반의 바깥 경계를
  // 부드럽게 풀어 '오려낸 원' 문제를 반대 방향에서도 죽인다.
  for (let index = diskCount; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const cosPhi = random() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const shell = (1.05 + random() * 0.3) * radius;

    positions[index * 3] = shell * sinPhi * Math.cos(theta);
    positions[index * 3 + 1] = shell * sinPhi * Math.sin(theta);
    positions[index * 3 + 2] = shell * cosPhi * 0.5;

    const isGlobular = index - diskCount < 4;
    const fade = 1 - ((shell / radius - 1.05) / 0.3) * 0.6;
    mixed.copy(isGlobular ? GLOBULAR_TINT : HALO_TINT).multiplyScalar(fade);

    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
    sizes[index] = isGlobular ? 1.9 : 0.6 + 2.8 * Math.pow(random(), 6);
    twinkles[index] = 0.1;
    phases[index] = random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new BufferAttribute(twinkles, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  return geometry;
}

// 점 하나하나가 제 크기와 박자를 갖는다 — pointsMaterial은 균일한 크기만 그릴 수 있어
// 셰이더로 바꿨다. 배경 별(UniverseSky의 STAR_VERTEX)과 같은 검증된 패턴.
const DISK_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
attribute float aTwinkle;
attribute float aPhase;
uniform float uTime;
uniform float uPointSize;
uniform float uPixelScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // gl_PointSize는 기기 픽셀 단위 — uPixelScale(dpr/2)이 화면마다 같은 CSS 크기로 맞춘다.
  gl_PointSize = uPointSize * aSize * uPixelScale;
  float pulse = 0.5 + 0.5 * sin(uTime * (0.4 + aPhase * 1.3) + aPhase * 6.2831853);
  vAlpha = mix(1.0, 0.6 + 0.4 * pulse, aTwinkle);
  vColor = aColor;
}
`;

const DISK_FRAGMENT = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float mask = texture2D(uMap, gl_PointCoord).a;
  gl_FragColor = vec4(vColor, mask * uOpacity * vAlpha);
}
`;

// 해석적 벌지 — 드 보쿨레르 프로파일 비슷한 지수 감쇠. 텍스처가 아니라 수식이라 어느
// 배율에서도 알파가 표시 한계 아래로 '뚝' 떨어지는 자리(오려낸 원 테두리)가 없다.
// 중심 몇 픽셀만 흰색으로 타올라 블룸 문턱(0.93)을 넘는다 — 바늘끝 눈부심.
const CORE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CORE_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uStretch;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.x /= uStretch.x;
  float r = max(length(p), 1e-4);
  float profile = exp(-4.8 * pow(r, 0.55));
  vec3 col = mix(uColor, vec3(1.0), smoothstep(0.55, 0.95, profile));
  gl_FragColor = vec4(col, profile * uOpacity);
}
`;

function GalaxyDiskComponent({
  radius,
  brightness,
  kind,
  seed,
  coreColor,
  armColor,
  highlighted = false,
  highlightColor = '#D6E4FF',
  opacity = 1,
  coreFade = 1,
  pointSize = 2,
}: {
  radius: number;
  brightness: number;
  kind: DiskKind;
  seed: number;
  coreColor: string;
  armColor: string;
  highlighted?: boolean;
  // 표식 색 — 내 지역이면 골드, 고른 지역이면 얼음빛(호출자가 정한다).
  highlightColor?: string;
  // 뭉침이 풀릴수록 원반이 옅어진다.
  opacity?: number;
  // 핵을 얼마나 살릴지(0~1). 은하가 화면을 덮을 만큼 커지면 장면이 정한다.
  coreFade?: number;
  // 점 하나의 화면 크기(px). 점은 배율을 따라 커지지 않는다 — 실제 별처럼 서로 멀어지기만
  // 하고 크기는 그대로여야 '가까이 갈수록 낱개로 풀리는' 느낌이 난다.
  pointSize?: number;
}) {
  const groupRef = useRef<Group>(null);

  // 원반은 **반지름 1**로 만들고 그룹 배율로 키운다. 화면 크기를 그대로 반지름에 넣으면
  // 배율이 조금만 바뀌어도 수천 개 파티클 버퍼를 매 프레임 다시 만들게 된다.
  //
  // 파티클 수도 화면 크기를 따라가되 계단으로 끊는다 — 연속으로 따라가면 같은 문제가 난다.
  const count = 420 * Math.min(4, Math.max(1, Math.round(pointSize)));
  const geometry = useMemo(
    () => buildDiskGeometry({
      count,
      radius: 1,
      kind,
      seed,
      coreColor: new Color(coreColor),
      armColor: new Color(armColor),
    }),
    [armColor, coreColor, count, kind, seed],
  );

  // 파티클 버퍼는 우리가 만들었으므로 우리가 치운다. r3f는 prop으로 받은 geometry를
  // 정리해 주지 않아서(Points에는 dispose가 없다), 확대하며 원반이 수백 번 생겼다 사라지는
  // 이 화면에서는 GPU 버퍼가 그대로 쌓인다.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // 재질은 한 번 만들고 유니폼만 갱신한다 — 페이드·밝기를 의존성에 넣으면 확대하는 내내
  // 프레임마다 셰이더 프로그램이 쌓인다(CelestialSphere의 규율과 같다).
  // dpr 보정 — 점 크기는 dpr 2 화면에서 조율했으므로 그 look을 기준(1x)으로 고정한다.
  const dpr = useThree((state) => state.viewport.dpr);

  const pointsMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPointSize: { value: 2 },
      uPixelScale: { value: 1 },
      uOpacity: { value: 1 },
      uMap: { value: getStarPointTexture() },
    },
    vertexShader: DISK_VERTEX,
    fragmentShader: DISK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }), []);

  const coreMaterial = useMemo(() => {
    const stretchRandom = seeded(seed + 411);

    return new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(coreColor) },
        uOpacity: { value: 0 },
        // 살짝 막대꼴 — 완벽한 원은 '그린 도형'의 결정적 단서다. 은하마다 다르게.
        uStretch: { value: [1 + 0.3 * stretchRandom(), 1] },
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }, [coreColor, seed]);

  useEffect(() => () => pointsMaterial.dispose(), [pointsMaterial]);
  useEffect(() => () => coreMaterial.dispose(), [coreMaterial]);

  pointsMaterial.uniforms.uPointSize.value = pointSize;
  pointsMaterial.uniforms.uPixelScale.value = dpr * 0.5;
  pointsMaterial.uniforms.uOpacity.value = (0.55 + 0.45 * brightness) * opacity;
  coreMaterial.uniforms.uOpacity.value = (0.22 + 0.26 * brightness) * opacity * coreFade;
  // 먼지는 서서히 들어온다 — 이진 게이트는 완전히 보이는 크기에서 어두운 판을 한 프레임에
  // 툭 떨어뜨렸다.
  const dustFade = smoothStep(1.45, 1.9, pointSize);

  // 기울기 — 정면에서 조금 틀어 원반이 타원으로 보이게. 시드로 은하마다 다르게.
  //
  // 회전이 아니라 **납작하게 눌러서** 만든다. 실제로 기울이면 원반의 y 폭이 깊이(z)로
  // 들어가고, 장면 전체가 배율(최대 수백 배)로 확대되면서 카메라의 near/far 밖으로 밀려나
  // 통째로 잘려 나간다. 직교 투영이라 눌러도 보이는 모양은 같다.
  const tilt = useMemo(() => {
    const random = seeded(seed + 977);
    // 0.35~0.85 rad(20~49°) — 원반이 타원으로 보이되 선으로 찌그러지지 않는 범위.
    return 0.35 + random() * 0.5;
  }, [seed]);
  const yaw = useMemo(() => seeded(seed + 31)() * Math.PI * 2, [seed]);
  // 회전의 정체성 — 방향과 속도가 시드에서 나온다. 전부 같은 속도로 같은 방향이면 장면이
  // 하나의 기계로 읽힌다. 막대 방향도 시드에서.
  const spinDirection = seed % 2 === 0 ? 1 : -1;
  const spinRate = useMemo(() => 0.038 + seeded(seed + 53)() * 0.034, [seed]);
  const barAngle = useMemo(() => seeded(seed + 89)() * Math.PI, [seed]);

  useFrame((state, delta) => {
    pointsMaterial.uniforms.uTime.value = state.clock.elapsedTime;

    if (groupRef.current) {
      // 은하는 스스로 돈다. 화면을 채울수록 느리게 — 거대한 것은 느리게 움직여야 거대해
      // 보인다(coreFade가 이미 '화면을 얼마나 채웠는지'를 알고 있다).
      groupRef.current.rotation.z += delta * spinRate * spinDirection * (0.35 + 0.65 * coreFade);
    }
  });

  return (
    <group rotation={[0, 0, yaw]} scale={[radius, radius * Math.cos(tilt), radius]}>
      {/* 핵 — 해석적 벌지. 같은 z의 형제들은 생성 순서대로 그려지므로(three의 투명 정렬은
          renderOrder → 깊이 → id 순) 핵 → 먼지 → 별의 겹침이 JSX 순서로 보장된다 —
          단, **셋 다 처음부터 마운트되어 있어야** 한다. 문턱에서 조건부로 마운트하면
          나중에 태어난 것이 더 큰 id를 받아 형제들 위에 그려진다(먼지가 별을 이중으로
          덮던 실제 버그). 그래서 끄는 건 unmount가 아니라 visible로 한다. */}
      <mesh material={coreMaterial} rotation={[0, 0, barAngle]} visible={coreFade > 0.01}>
        <planeGeometry args={[1.05, 1.05]} />
      </mesh>

      <group ref={groupRef}>
        {/* 먼지 띠 — 별들과 같은 그룹에서 함께 돈다. 가산이 아니라 일반 합성이라 뒤의
            별빛을 삼킨다 — 화면의 총 광량을 낮추면서 구조를 만드는 유일한 판.
            판은 2.0 유닛이어야 한다: 텍스처의 단위 원이 원반 반지름 1에 정확히 앉아
            입자에 구운 소광과 같은 자리에서 만난다(1.9면 5% 안쪽으로 어긋난다). */}
        {kind === 'galaxy' ? (
          <mesh visible={dustFade > 0.01}>
            <planeGeometry args={[2, 2]} />
            <meshBasicMaterial
              map={getDustLaneTexture()}
              color="#0A0604"
              transparent
              opacity={0.55 * opacity * dustFade}
              depthWrite={false}
            />
          </mesh>
        ) : null}

        <points geometry={geometry} material={pointsMaterial} />
      </group>

      {/* 내 지역 — 숨쉬는 1px 링(정면으로 눕혀 원반과 같은 평면에 놓는다). 은하만 한
          링이라 두꺼우면 우주가 아니라 화면에 그린 도형으로 보인다. */}
      {highlighted ? (
        <HighlightRing color={highlightColor} opacity={0.85 * opacity} scale={3.19} />
      ) : null}
    </group>
  );
}

export const GalaxyDisk = memo(GalaxyDiskComponent);
