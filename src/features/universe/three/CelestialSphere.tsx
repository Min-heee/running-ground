import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  type Group,
  ShaderMaterial,
} from 'three';

import {
  getCloudTexture,
  getPlanetSurface,
  getRingTexture,
  getStarSurface,
} from '@/features/universe/three/planetTextures';
import { getGlowTexture } from '@/features/universe/three/textures';
import { planetTraitsFor, starTraitsFor } from '@/features/universe/three/planetTraits';

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
// 그려 놓은 것처럼 보인다.
const ATMOSPHERE_FRAGMENT = `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vViewNormal;
void main() {
  float rim = 1.0 - abs(vViewNormal.z);
  float glow = pow(clamp(rim, 0.0, 1.0), 4.2);
  gl_FragColor = vec4(uColor, glow * uStrength);
}
`;

function useAtmosphereMaterial(color: string, strength: number, fade: number) {
  return useMemo(() => new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uStrength: { value: strength * fade * 0.45 },
    },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // 안쪽 면을 그려야 구 뒤쪽 가장자리가 앞으로 비쳐 테두리가 완성된다.
    side: BackSide,
  }), [color, fade, strength]);
}

function PlanetBody({
  id,
  radius,
  brightness,
  fade,
  detailed,
  segments,
}: {
  id: string;
  radius: number;
  brightness: number;
  fade: number;
  detailed: boolean;
  segments: number;
}) {
  const traits = useMemo(() => planetTraitsFor(id), [id]);
  const surface = getPlanetSurface(traits.kind, traits.variant);
  const bodyRef = useRef<Group>(null);
  const cloudRef = useRef<Group>(null);
  const atmosphere = useAtmosphereMaterial(
    traits.atmosphere?.color ?? '#FFFFFF',
    traits.atmosphere?.strength ?? 0,
    fade,
  );

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
    <group rotation={[0, 0, traits.tilt]}>
      <group ref={bodyRef}>
        <mesh>
          <sphereGeometry args={[radius, segments, segments]} />
          <meshStandardMaterial
            map={surface}
            color={new Color(traits.tint)}
            // 표면 요철 — 같은 텍스처를 높이로도 쓴다. 명암 경계에서 지형이 살아난다.
            bumpMap={detailed ? surface : undefined}
            bumpScale={detailed ? radius * 0.035 : 0}
            roughness={traits.kind === 'gas' ? 0.95 : 0.82}
            metalness={0.02}
            // 완전한 암흑면을 피할 만큼만 — 이게 크면 조명이 무의미해져 스티커처럼 보인다.
            emissive={new Color(traits.tint)}
            emissiveIntensity={0.05 + 0.09 * brightness}
            transparent={fade < 1}
            opacity={fade}
          />
        </mesh>
      </group>

      {detailed && traits.kind === 'terrestrial' ? (
        <group ref={cloudRef}>
          <mesh>
            <sphereGeometry args={[radius * 1.022, segments, segments]} />
            <meshStandardMaterial
              map={getCloudTexture()}
              transparent
              opacity={0.62 * fade}
              depthWrite={false}
              roughness={1}
            />
          </mesh>
        </group>
      ) : null}

      {detailed && traits.atmosphere ? (
        <mesh material={atmosphere}>
          <sphereGeometry args={[radius * 1.09, segments, segments]} />
        </mesh>
      ) : null}

      {detailed && traits.ring ? (
        <mesh rotation={[Math.PI / 2 - traits.ring.tilt, 0, 0]}>
          <ringGeometry args={[radius * traits.ring.inner, radius * traits.ring.outer, 96]} />
          <meshBasicMaterial
            map={getRingTexture()}
            transparent
            opacity={0.85 * fade}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function StarBody({
  id,
  radius,
  brightness,
  fade,
  segments,
  lit,
}: {
  id: string;
  radius: number;
  brightness: number;
  fade: number;
  segments: number;
  lit: boolean;
}) {
  const traits = useMemo(() => starTraitsFor(id), [id]);
  const bodyRef = useRef<Group>(null);
  const color = new Color(traits.color);
  // 광구 가장자리 — 별은 원반이 아니라 타오르는 공이다. 테두리에 코로나 색을 얹어야
  // 표면과 코로나가 이어져 보인다.
  const limb = useAtmosphereMaterial(traits.coronaColor, 2.6, fade);

  useFrame((_, delta) => {
    if (bodyRef.current) {
      bodyRef.current.rotation.y += delta * traits.spin;
    }
  });

  return (
    <group>
      {/* 코로나 — 표면보다 훨씬 넓게 퍼지는 빛. 항성을 '밝은 공'이 아니라 광원으로 만든다. */}
      <mesh position={[0, 0, -2]}>
        <planeGeometry args={[radius * traits.corona * 2, radius * traits.corona * 2]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={new Color(traits.coronaColor)}
          transparent
          opacity={(0.75 + 0.25 * brightness) * fade}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <group ref={bodyRef}>
        <mesh>
          <sphereGeometry args={[radius, segments, segments]} />
          {/* 항성은 스스로 빛난다 — 조명을 받지 않으므로 basic 재질에 표면 무늬만 곱한다. */}
          <meshBasicMaterial
            map={getStarSurface()}
            color={color}
            transparent={fade < 1}
            opacity={fade}
          />
        </mesh>
      </group>

      <mesh material={limb}>
        <sphereGeometry args={[radius * 1.06, segments, segments]} />
      </mesh>

      {lit ? (
        <pointLight color={color} intensity={260} distance={radius * 90} decay={2} />
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
  palette: 'planet' | 'star' | 'protostar';
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
      // 원시성(이번 달 1등)은 아직 점화 전이라 주변을 밝히지 않는다.
      lit={palette === 'star' && detailed}
    />
  );
}

export const CelestialSphere = memo(CelestialSphereComponent);
