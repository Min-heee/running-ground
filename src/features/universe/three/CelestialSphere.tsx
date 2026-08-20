import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  type Group,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

import {
  getCloudTexture,
  getPlanetMask,
  getPlanetSurface,
  getRingTexture,
  getStarSurface,
} from '@/features/universe/three/planetTextures';
import { getGlowTexture, getSpikedStarTexture } from '@/features/universe/three/textures';
import { planetTraitsFor, starTraitsFor } from '@/features/universe/three/planetTraits';
import { smoothStep } from '@/features/universe/utils/universeSpace';

// 행성과 항성 (오너 2026-08-16: "진짜 행성·항성처럼").
//
// 매끈한 단색 구를 버리고 지형·구름·대기·고리를 가진 세계로 그린다. 재료는 전부 절차적
// 텍스처(planetTextures)라 이미지 파일이 없고, 러너별 차이는 아이디에서 결정론적으로
// 뽑는다(planetTraits).
//
// 정밀도는 화면 크기를 따라간다. 멀리 있는 행성에까지 구름·대기·고리를 얹으면 한 화면에
// 수십 개가 뜨는 이 우주에서 드로우콜만 수백이 된다 — 가까이 온 것만 완전한 세계가 된다.
const DETAILED_SCREEN_DIAMETER = 54;

// 대기 — 가장자리에서만 빛나는 얇은 껍질. 직교 투영이라 시선 벡터가 어디서나 +z다.
// 그래서 뷰 공간 법선의 z 성분이 곧 '정면을 향한 정도'이고, 1에서 뺀 값이 테두리가 된다.
const ATMOSPHERE_VERTEX = `
varying vec3 vViewNormal;
void main() {
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 지수가 크고 세기가 낮아야 '테두리 선'이 아니라 '공기'가 된다 — 완만하면 행성에 파란 링을
// 그려 놓은 것처럼 보인다 (오너 2026-08-19: "행성에서 너무 과한 빛이 나" — 4.2는 아직
// 두꺼운 발광 고리로 읽혔다. 실제 대기는 지평선의 얇은 헤이즈다).
const ATMOSPHERE_FRAGMENT = `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vViewNormal;
void main() {
  float rim = 1.0 - abs(vViewNormal.z);
  float glow = pow(clamp(rim, 0.0, 1.0), 6.0);
  gl_FragColor = vec4(uColor, glow * uStrength);
}
`;

// 재질은 색과 세기가 바뀔 때만 새로 만들고, 매 프레임 달라지는 페이드는 **유니폼만** 고친다.
//
// 페이드는 화면 크기·깊이에서 나오는 연속값이라 의존성에 넣으면 확대·이동하는 내내 프레임마다
// 새 ShaderMaterial이 만들어진다. 그 재질들은 아무도 정리하지 않아 GPU 프로그램과 유니폼이
// 그대로 쌓인다.
function useAtmosphereMaterial(color: string, strength: number, fade: number) {
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uStrength: { value: 0 },
    },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // 안쪽 면을 그려야 구 뒤쪽 가장자리가 앞으로 비쳐 테두리가 완성된다.
    side: BackSide,
  }), [color]);

  material.uniforms.uStrength.value = strength * fade * 0.34;

  useEffect(() => () => material.dispose(), [material]);

  return material;
}

// 주광의 방향(빛을 향하는 쪽) — UniverseSky의 키 라이트 position과 같은 값. 도시 불빛이
// 정확히 그 빛의 반대면(밤면)에서 켜지려면 조명과 이 상수가 같은 곳을 가리켜야 한다.
const KEY_LIGHT_DIR = new Vector3(-320, 380, 520).normalize();

// 도시/바다 마스크를 미리 덥힌다 — 안 그러면 첫 지구형 클로즈업의 셰이더 컴파일 순간에
// 잡음 텍스처(~80ms)가 동기로 만들어져 확대가 한 번 컥 걸린다. 첫 화면이 자리잡은 뒤
// 한 장씩, 취소하지 않는다(캐시 채우기라 언제 끝나도 이득).
let planetMasksPrewarmed = false;

function prewarmPlanetMasks() {
  if (planetMasksPrewarmed) {
    return;
  }

  planetMasksPrewarmed = true;
  [0, 1, 2, 3].forEach((variant, index) => {
    setTimeout(() => getPlanetMask(variant), 2000 + index * 400);
  });
}

function PlanetBody({
  id,
  radius,
  brightness,
  fade,
  detailed,
  segments,
  screenDiameter,
}: {
  id: string;
  radius: number;
  brightness: number;
  fade: number;
  detailed: boolean;
  segments: number;
  screenDiameter: number;
}) {
  const traits = useMemo(() => planetTraitsFor(id), [id]);
  const surface = getPlanetSurface(traits.kind, traits.variant);
  const bodyRef = useRef<Group>(null);
  const cloudRef = useRef<Group>(null);

  useEffect(() => {
    prewarmPlanetMasks();
  }, []);
  const atmosphere = useAtmosphereMaterial(
    traits.atmosphere?.color ?? '#FFFFFF',
    traits.atmosphere?.strength ?? 0,
    fade,
  );

  // 가까이 온 지구형 행성의 궤도 접근 샷 — 바다는 매끈해져 태양의 반짝임이 흐르고,
  // 명암 경계선(터미네이터)을 따라 밤면에 도시 불빛이 켜진다. 표준 셰이더에 마스크 두 줄을
  // 주입할 뿐이라 낮면·하늘의 광량은 그대로다. 먼 행성은 오늘의 재질 그대로.
  const litSurface = useMemo(() => {
    if (!detailed || traits.kind !== 'terrestrial') {
      return null;
    }

    const material = new MeshStandardMaterial({
      map: surface,
      color: new Color(traits.tint),
      bumpMap: surface,
      bumpScale: 0.055,
      roughness: 0.82,
      metalness: 0.02,
      emissive: new Color(traits.tint),
      // 언제나 transparent — fade에 따라 토글하면 처음 컴파일 때의 상태가 OPAQUE
      // define으로 프로그램에 구워져(needsUpdate 없이는 재컴파일이 없다), 이후의
      // 근접 페이드가 죽고 천체가 컷 평면에서 툭 사라진다.
      transparent: true,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMask = { value: getPlanetMask(traits.variant) };
      shader.uniforms.uLightDir = { value: KEY_LIGHT_DIR };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uMask;\nuniform vec3 uLightDir;',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          // 바다만 매끈하게 — 키 라이트가 수면 위에 반짝임을 만든다.
          '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.3, texture2D(uMask, vMapUv).g);',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  {
    float night = clamp(-dot(normalize(vNormal), uLightDir), 0.0, 1.0);
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * texture2D(uMask, vMapUv).r * night * 0.55;
  }`,
        );
    };
    // 변종이 달라도 셰이더는 하나 — 프로그램이 러너 수만큼 컴파일되지 않게.
    material.customProgramCacheKey = () => 'rg-planet-city';
    return material;
  }, [detailed, surface, traits]);

  useEffect(() => () => litSurface?.dispose(), [litSurface]);

  if (litSurface) {
    litSurface.emissiveIntensity = 0.02 + 0.03 * brightness;
    litSurface.opacity = fade;
  }

  // 고리 텍스처는 1D 반지름 띠인데 three 0.185의 RingGeometry UV는 반지름이 아니라
  // **평면 좌표**를 따른다 — 그대로 두면 띠가 동심원이 아니라 세로 줄무늬로 발린다.
  // u를 반지름으로 다시 써서 카시니 간극이 진짜 원둘레 간극이 되게 한다.
  const ringGeometry = useMemo(() => {
    if (!traits.ring) {
      return null;
    }

    const geometry = new RingGeometry(traits.ring.inner, traits.ring.outer, 96);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const span = traits.ring.outer - traits.ring.inner;

    for (let index = 0; index < uvs.count; index += 1) {
      const ringRadius = Math.hypot(positions.getX(index), positions.getY(index));
      uvs.setXY(index, (ringRadius - traits.ring.inner) / span, 0.5);
    }

    return geometry;
  }, [traits]);

  useEffect(() => () => ringGeometry?.dispose(), [ringGeometry]);

  // 구체가 점에서 풀리기 시작하는 크기(≈14px)부터 고리가 배어 나와 34px에서 온전해진다.
  const ringOpacity = 0.85 * fade * smoothStep(14, 34, screenDiameter);

  useFrame((_, delta) => {
    if (bodyRef.current) {
      bodyRef.current.rotation.y += delta * traits.spin;
    }

    // 구름은 지면보다 조금 빠르게 — 그 차이가 대기를 살아 있게 만든다.
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * traits.spin * 1.35;
    }
  });

  return (
    // 구체는 반지름 1로 만들고 배율로 키운다 — 화면 크기를 반지름에 넣으면 배율이 바뀔
    // 때마다 정점 수천 개짜리 버퍼를 새로 만든다.
    <group rotation={[0, 0, traits.tilt]} scale={radius}>
      <group ref={bodyRef}>
        <mesh material={litSurface ?? undefined}>
          <sphereGeometry args={[1, segments, segments]} />
          {litSurface ? null : (
            <meshStandardMaterial
              // 문턱을 넘을 때 재질을 갈아끼운다 — bumpMap을 산 재질에 꽂으면 needsUpdate
              // 없이는 셰이더가 재컴파일되지 않아 요철이 영영 안 살아난다.
              key={detailed ? 'detailed' : 'far'}
              map={surface}
              color={new Color(traits.tint)}
              // 표면 요철 — 같은 텍스처를 높이로도 쓴다. 명암 경계에서 지형이 살아난다.
              bumpMap={detailed ? surface : undefined}
              bumpScale={detailed ? 0.055 : 0}
              roughness={traits.kind === 'gas' ? 0.95 : 0.82}
              metalness={0.02}
              // 완전한 암흑면을 피할 만큼만 — 이게 크면 조명이 무의미해져 스티커처럼 보인다.
              emissive={new Color(traits.tint)}
              emissiveIntensity={0.02 + 0.03 * brightness}
              // 언제나 transparent — 토글하면 OPAQUE define이 구워져 근접 페이드가 죽는다.
              transparent
              opacity={fade}
            />
          )}
        </mesh>
      </group>

      {detailed && traits.kind === 'terrestrial' ? (
        <group ref={cloudRef}>
          <mesh>
            <sphereGeometry args={[1.022, segments, segments]} />
            <meshStandardMaterial
              map={getCloudTexture()}
              transparent
              opacity={0.5 * fade}
              depthWrite={false}
              roughness={1}
            />
          </mesh>
        </group>
      ) : null}

      {detailed && traits.atmosphere ? (
        <mesh material={atmosphere}>
          <sphereGeometry args={[1.055, segments, segments]} />
        </mesh>
      ) : null}

      {/* 고리는 detailed(54px) 문턱을 기다리지 않는다 — 고리는 그 행성의 실루엣이라
          멀리서도 '고리 행성'으로 읽혀야 한다 (오너 2026-08-19: "멀리서도 어느 정도
          보이는 것도 나쁘지 않을 것 같아"). 구체가 점에서 풀리는 크기(14px)부터 서서히
          배어 나온다 — 문턱에서 뿅 나타나면 확대가 전환으로 느껴진다. */}
      {ringGeometry && ringOpacity > 0.02 ? (
        <mesh geometry={ringGeometry} rotation={[Math.PI / 2 - (traits.ring?.tilt ?? 0), 0, 0]}>
          <meshBasicMaterial
            map={getRingTexture()}
            transparent
            opacity={ringOpacity}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}

// 끓는 광구 — 같은 표면 지도를 시간에 따라 뒤틀린 두 좌표로 겹쳐 읽으면 대류가 실제로
// 일렁인다. 가장 뜨거운 알갱이만 블룸 문턱(0.93)을 넘게 밀어 올려, 표면 전체가 아니라
// 뜨거운 세포들이 반짝인다. 정지한 텍스처가 도는 것은 램프지 태양이 아니다.
const PHOTOSPHERE_VERTEX = `
varying vec2 vUv;
varying vec3 vViewNormal;
void main() {
  vUv = uv;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 주연감광 — 진짜 항성 원반은 **가장자리가 어둡다**(시선이 광구의 얕고 차가운 층만
// 스치기 때문). 평평하게 빛나는 원반은 눈이 곧바로 램프로 읽는다 — 이 한 가지가
// '빛나는 공'과 '태양 사진'을 가른다. 가장자리는 어두워지며 살짝 붉어진다.
const PHOTOSPHERE_FRAGMENT = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vViewNormal;
void main() {
  vec2 warp = vec2(sin(uTime * 0.05), cos(uTime * 0.04)) * 0.02;
  float a = texture2D(uMap, vUv + warp).r;
  float b = texture2D(uMap, vUv * 1.7 - warp * 1.6 + vec2(0.37)).r;
  float g = mix(a, b, 0.5 + 0.5 * sin(uTime * 0.35));
  vec3 col = uColor * (0.62 + 0.55 * g) + uColor * smoothstep(0.82, 1.0, g) * 0.9;
  float mu = clamp(abs(vViewNormal.z), 0.0, 1.0);
  col *= 0.32 + 0.68 * pow(mu, 0.85);
  col *= mix(vec3(1.0, 0.74, 0.52), vec3(1.0), 0.35 + 0.65 * mu);
  gl_FragColor = vec4(col, uOpacity);
}
`;

// 코로나 스트리머 — 각도 방향의 두 파동이 서로 반대로 돌며 간섭한다. 정지한 후광 위에서
// 빛줄기가 흐르는 것처럼 읽히는 가장 값싼 방법.
const STREAMER_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uDir;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float lobes = 0.6 + 0.4 * sin(ang * 12.0 + uTime * uDir * 0.15 + uSeed)
    * sin(ang * 5.0 - uTime * uDir * 0.09);
  float glow = pow(max(0.0, 1.0 - r), 3.0) * lobes;
  gl_FragColor = vec4(uColor, glow * uOpacity);
}
`;

function useStreamerMaterial(color: string, direction: number, seedValue: number) {
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uDir: { value: direction },
      uSeed: { value: seedValue },
    },
    vertexShader: PHOTOSPHERE_VERTEX,
    fragmentShader: STREAMER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }), [color, direction, seedValue]);

  useEffect(() => () => material.dispose(), [material]);

  return material;
}

function StarBody({
  id,
  radius,
  brightness,
  fade,
  segments,
  lit,
  detailed,
  screenDiameter,
}: {
  id: string;
  radius: number;
  brightness: number;
  fade: number;
  segments: number;
  lit: boolean;
  detailed: boolean;
  screenDiameter: number;
}) {
  const traits = useMemo(() => starTraitsFor(id), [id]);
  const bodyRef = useRef<Group>(null);
  const color = new Color(traits.color);
  // 광구 가장자리 — 별은 원반이 아니라 타오르는 공이다. 테두리에 코로나 색을 얹어야
  // 표면과 코로나가 이어져 보인다.
  const limb = useAtmosphereMaterial(traits.coronaColor, 2.6, fade);
  // id에서 스트리머 위상을 — 챔피언마다 다른 태양이 되도록.
  const streamerSeed = useMemo(
    () => Array.from(id).reduce((sum, char) => (sum + char.charCodeAt(0)) % 628, 0) / 100,
    [id],
  );

  // 재질은 만들어 두고 유니폼만 — 페이드를 의존성에 넣으면 확대하는 내내 재질이 쌓인다.
  const photosphere = useMemo(() => new ShaderMaterial({
    uniforms: {
      uMap: { value: getStarSurface() },
      uColor: { value: new Color(traits.color) },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: PHOTOSPHERE_VERTEX,
    fragmentShader: PHOTOSPHERE_FRAGMENT,
    transparent: true,
  }), [traits.color]);
  const streamerOut = useStreamerMaterial(traits.coronaColor, 1, streamerSeed);
  const streamerIn = useStreamerMaterial(traits.color, -1, streamerSeed + 1.7);

  useEffect(() => () => photosphere.dispose(), [photosphere]);

  // 코로나는 클로즈업에서 접는다 — corona×2 판이 화면을 덮으면 가산합성이 검은 바닥을
  // 들어올린다. 광구가 주인공인 거리에서는 광구가 빛나면 된다. 0으로 죽이지는 않는다.
  const coronaFold = 1 - 0.6 * smoothStep(300, 600, screenDiameter);

  photosphere.uniforms.uOpacity.value = fade;
  streamerOut.uniforms.uOpacity.value = 0.5 * fade * coronaFold;
  streamerIn.uniforms.uOpacity.value = 0.35 * fade * coronaFold;

  useFrame((state, delta) => {
    if (bodyRef.current) {
      bodyRef.current.rotation.y += delta * traits.spin;
    }

    photosphere.uniforms.uTime.value = state.clock.elapsedTime;
    streamerOut.uniforms.uTime.value = state.clock.elapsedTime;
    streamerIn.uniforms.uTime.value = state.clock.elapsedTime;
  });

  // 회절 십자는 원거리 광학의 산물 — 광구가 화면을 채우기 시작하면 물러난다.
  const spikeOpacity = detailed
    ? (0.45 + 0.35 * brightness) * fade * (1 - smoothStep(260, 420, screenDiameter))
    : 0;

  return (
    <group scale={radius}>
      {/* 코로나 — 표면보다 훨씬 넓게 퍼지는 빛. 항성을 '밝은 공'이 아니라 광원으로 만든다. */}
      <mesh position={[0, 0, -2 / Math.max(1e-6, radius)]}>
        <planeGeometry args={[traits.corona * 2, traits.corona * 2]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={new Color(traits.coronaColor)}
          transparent
          // 광륜은 살짝 물러난다 — 완벽한 방사형 그라데이션이 셀수록 원반이 램프로 읽힌다.
          // 이제 눈부심의 주역은 주연감광이 살린 원반과 블룸을 뚫는 뜨거운 대류 세포들이다.
          opacity={(0.62 + 0.25 * brightness) * fade * coronaFold}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* 스트리머 두 장 — 서로 반대로 돌며 간섭해 코로나가 흐른다. 가까이 갔을 때만. */}
      {detailed ? (
        <>
          <mesh material={streamerOut} position={[0, 0, -1.5 / Math.max(1e-6, radius)]}>
            <planeGeometry args={[traits.corona * 2, traits.corona * 2]} />
          </mesh>
          <mesh material={streamerIn} position={[0, 0, -1 / Math.max(1e-6, radius)]}>
            <planeGeometry args={[traits.corona * 1.4, traits.corona * 1.4]} />
          </mesh>
        </>
      ) : null}

      {/* 회절 십자 — 절대 회전하지 않는다. 실제 십자는 망원경 광학에 고정돼 있고, 도는
          광구 위에 정지한 십자가 겹치는 것이 관측 사진의 문법이다. */}
      {spikeOpacity > 0.02 ? (
        <mesh position={[0, 0, 1.2 / Math.max(1e-6, radius)]}>
          <planeGeometry args={[traits.corona * 3, traits.corona * 3]} />
          <meshBasicMaterial
            map={getSpikedStarTexture()}
            color={new Color(traits.coronaColor)}
            transparent
            opacity={spikeOpacity}
            depthWrite={false}
            // 십자의 z(+1.2px)는 광구 앞면(+반지름)보다 뒤라 깊이 검사에 걸려 실루엣
            // 안쪽이 통째로 잘린다 — 가산합성이라 깊이가 무의미하니 검사 자체를 끈다.
            depthTest={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ) : null}

      <group ref={bodyRef}>
        <mesh material={detailed ? photosphere : undefined}>
          <sphereGeometry args={[1, segments, segments]} />
          {/* 멀리서는 끓일 필요가 없다 — 정지한 표면 무늬로 충분하고 훨씬 싸다. */}
          {detailed ? null : (
            <meshBasicMaterial
              map={getStarSurface()}
              color={color}
              // 언제나 transparent — 토글하면 OPAQUE define이 구워져 페이드가 죽는다.
              transparent
              opacity={fade}
            />
          )}
        </mesh>
      </group>

      <mesh material={limb}>
        <sphereGeometry args={[1.06, segments, segments]} />
      </mesh>

      {lit ? (
        <pointLight color={color} intensity={260} distance={90} decay={2} />
      ) : null}
    </group>
  );
}

function CelestialSphereComponent({
  id,
  palette,
  radius,
  screenDiameter,
  brightness,
  fade,
}: {
  id: string;
  palette: 'planet' | 'star';
  radius: number;
  screenDiameter: number;
  brightness: number;
  fade: number;
}) {
  const detailed = screenDiameter >= DETAILED_SCREEN_DIAMETER;
  const segments = screenDiameter > 260 ? 48 : screenDiameter > 90 ? 32 : 16;

  if (palette === 'planet') {
    return (
      <PlanetBody
        id={id}
        radius={radius}
        brightness={brightness}
        fade={fade}
        detailed={detailed}
        segments={segments}
        screenDiameter={screenDiameter}
      />
    );
  }

  return (
    <StarBody
      id={id}
      radius={radius}
      brightness={brightness}
      fade={fade}
      segments={segments}
      // 가까이 왔을 때만 실제 광원이 된다 — 먼 항성 수십 개가 다 조명을 켜면 비용만 든다.
      lit={detailed}
      detailed={detailed}
      screenDiameter={screenDiameter}
    />
  );
}

export const CelestialSphere = memo(CelestialSphereComponent);
