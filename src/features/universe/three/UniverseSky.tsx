import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  type Points,
} from 'three';

import {
  getGlowTexture,
  getNebulaTexture,
  getStarPointTexture,
} from '@/features/universe/three/textures';
import { GalaxyDisk } from '@/features/universe/three/GalaxyDisk';

// 3D 우주 레이어 (오너 2026-08-15: "실제 우주처럼"). 겹친 반투명 View로 내던 발광체를
// 진짜 구체 + 가산합성 후광으로 바꾼다.
//
// 좌표계: 직교 카메라(zoom 1)라 월드 1 = 화면 1픽셀이다. 그래서 기존 배치 수학
// (universeLayout)이 준 화면 좌표를 그대로 받아 쓸 수 있고, 레이블·터치 영역은 RN View로
// 위에 그대로 남는다 — 텍스트는 선명하게, 히트 판정은 검증된 경로를 유지한다.

export type SkyOrb = {
  id: string;
  // 화면 좌표(좌상단 원점) — RN 레이어와 같은 값.
  x: number;
  y: number;
  diameter: number;
  // 0~1, 서버 계산값.
  brightness: number;
  palette: 'group' | 'galaxy' | 'planet' | 'star' | 'protostar';
  highlighted?: boolean;
  // LOD 교차 페이드 (0~1). 생략하면 1 — 기존 호출부는 그대로 동작한다.
  opacity?: number;
};

// 은하·은하군은 파티클 원반이라 구체 팔레트와 색 규칙이 다르다(핵 → 팔 그라데이션).
const DISK_COLORS: Record<'group' | 'galaxy', { core: string; arm: string }> = {
  galaxy: { core: '#FFF0CE', arm: '#6E86FF' },
  group: { core: '#FFE7D8', arm: '#A672FF' },
};

const PALETTE_COLORS: Record<SkyOrb['palette'], { core: string; glow: string; emissive: number }> = {
  group: { core: '#FFE9C4', glow: '#A672FF', emissive: 0.85 },
  galaxy: { core: '#FFE9C4', glow: '#8AA8FF', emissive: 0.85 },
  planet: { core: '#B7E2FF', glow: '#5F96F0', emissive: 0.55 },
  star: { core: '#FFD467', glow: '#FF9E3D', emissive: 1.5 },
  protostar: { core: '#FFEEB8', glow: '#FFC868', emissive: 1.1 },
};

// 별 배경 3겹 — 깊이별로 크기·밝기·표류 속도가 달라 시차가 생긴다.
const STAR_LAYERS = [
  { count: 260, z: -420, size: 2.6, opacity: 0.5, drift: 0.004 },
  { count: 170, z: -260, size: 3.6, opacity: 0.72, drift: 0.009 },
  { count: 90, z: -140, size: 5.2, opacity: 0.92, drift: 0.016 },
];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function StarLayer({
  count,
  z,
  size,
  opacity,
  drift,
  width,
  height,
  seed,
}: {
  count: number;
  z: number;
  size: number;
  opacity: number;
  drift: number;
  width: number;
  height: number;
  seed: number;
}) {
  const pointsRef = useRef<Points>(null);

  const geometry = useMemo(() => {
    const random = seededRandom(seed);
    const positions = new Float32Array(count * 3);
    // 화면보다 넉넉히 넓게 뿌린다 — 표류해도 가장자리가 비지 않게.
    const spreadX = width * 1.6;
    const spreadY = height * 1.6;

    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random() - 0.5) * spreadX;
      positions[index * 3 + 1] = (random() - 0.5) * spreadY;
      positions[index * 3 + 2] = z;
    }

    const buffer = new BufferGeometry();
    buffer.setAttribute('position', new BufferAttribute(positions, 3));
    return buffer;
  }, [count, height, seed, width, z]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      // 아주 느린 표류 — 정지 화면이 아니라 살아있는 하늘로 보이게 하는 최소한의 움직임.
      pointsRef.current.rotation.z += delta * drift * 0.05;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={size}
        map={getStarPointTexture()}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={AdditiveBlending}
        sizeAttenuation={false}
      />
    </points>
  );
}

// 성운 — 큰 가산합성 판 몇 장을 서로 다른 색·크기·회전으로 겹쳐 구름 덩어리를 만든다.
function Nebula({ width, height }: { width: number; height: number }) {
  const groupRef = useRef<Group>(null);
  const clouds = useMemo(() => {
    const random = seededRandom(20260815);
    const palette = ['#4C3BC7', '#7B4BD6', '#2F5BD0', '#8E3FA8'];

    return Array.from({ length: 9 }, (_, index) => ({
      key: `cloud-${index}`,
      x: (random() - 0.5) * width * 1.45,
      y: (random() - 0.5) * height * 1.45,
      z: -340 + index * 14,
      scale: Math.min(width, height) * (1.05 + random() * 1.15),
      rotation: random() * Math.PI,
      color: palette[index % palette.length],
      opacity: 0.15 + random() * 0.16,
    }));
  }, [height, width]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * 0.006;
    }
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud) => (
        <mesh key={cloud.key} position={[cloud.x, cloud.y, cloud.z]} rotation={[0, 0, cloud.rotation]}>
          <planeGeometry args={[cloud.scale, cloud.scale]} />
          <meshBasicMaterial
            map={getNebulaTexture()}
            color={new Color(cloud.color)}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function CelestialBody({ orb, width, height }: { orb: SkyOrb; width: number; height: number }) {
  const colors = PALETTE_COLORS[orb.palette];
  // 화면 좌표(좌상단 원점) → 월드 좌표(중앙 원점, y 위로).
  const worldX = orb.x - width / 2;
  const worldY = height / 2 - orb.y;
  const radius = orb.diameter / 2;
  const groupRef = useRef<Group>(null);
  const spinSpeed = useMemo(() => 0.05 + (orb.id.length % 5) * 0.012, [orb.id]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * spinSpeed;
    }
  });

  const glowScale = radius * (orb.palette === 'star' ? 13 : 8.5);
  const coreColor = new Color(colors.core);
  const glowColor = new Color(colors.glow);

  // 은하·은하군은 발광체가 아니라 수천 개 별이 모인 구조물이다 — 구체 대신 원반을 그린다.
  const fade = orb.opacity ?? 1;

  if (fade <= 0.02) {
    return null;
  }

  if (orb.palette === 'galaxy' || orb.palette === 'group') {
    const disk = DISK_COLORS[orb.palette];
    // 문자열 id를 안정적인 시드로 — 같은 지역은 항상 같은 기울기·회전을 갖는다.
    const seed = Array.from(orb.id).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647, 7);

    return (
      <group position={[worldX, worldY, 0]}>
        <GalaxyDisk
          radius={radius * 2.1}
          brightness={orb.brightness}
          opacity={fade}
          kind={orb.palette}
          seed={seed}
          coreColor={disk.core}
          armColor={disk.arm}
          highlighted={orb.highlighted}
        />
      </group>
    );
  }

  return (
    <group position={[worldX, worldY, 0]}>
      {/* 후광 — 가산합성이라 겹칠수록 밝아진다. 구체보다 뒤(z-)에 둬 테두리를 먹지 않게. */}
      <mesh position={[0, 0, -2]}>
        <planeGeometry args={[glowScale, glowScale]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={glowColor}
          transparent
          opacity={(0.45 + 0.5 * orb.brightness) * fade}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* 본체 — 방향광이 만드는 명암 경계선이 '원'을 '구'로 읽히게 하는 핵심이다. */}
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshStandardMaterial
            color={coreColor}
            emissive={coreColor}
            emissiveIntensity={colors.emissive * (0.1 + 0.28 * orb.brightness)}
            roughness={0.72}
            metalness={0.02}
            transparent={fade < 1}
            opacity={fade}
          />
        </mesh>
      </group>

      {/* 내 천체 — 얇은 링. 색을 바꾸지 않는 건 밝기 정보를 죽이지 않기 위해서다. */}
      {orb.highlighted ? (
        <mesh position={[0, 0, radius * 0.2]} rotation={[0, 0, 0]}>
          <ringGeometry args={[radius * 1.35, radius * 1.5, 48]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ) : null}

      {/* 항성은 스스로 주변을 밝힌다 — 옆 행성에 실제로 빛이 닿는다. */}
      {orb.palette === 'star' || orb.palette === 'protostar' ? (
        <pointLight color={coreColor} intensity={orb.palette === 'star' ? 260 : 120} distance={520} decay={2} />
      ) : null}
    </group>
  );
}

function UniverseSkyComponent({
  orbs,
  width,
  height,
  zoom = 1,
  panX = 0,
  panY = 0,
}: {
  orbs: SkyOrb[];
  width: number;
  height: number;
  zoom?: number;
  panX?: number;
  panY?: number;
}) {
  return (
    <>
      {/* 은은한 환경광 — 완전한 암흑을 피하되 명암 경계는 살린다. */}
      <ambientLight intensity={0.28} color="#6E7FB5" />
      <directionalLight position={[-320, 380, 520]} intensity={2.1} color="#EAF1FF" />
      {/* 림 라이트: 카메라 반대편에서 스쳐 들어와 천체 가장자리에 얇은 빛 띠를 남긴다. */}
      <directionalLight position={[420, -280, -360]} intensity={1.5} color="#7FA8FF" />

      {/* 배경은 시차 — pan의 일부만 따라오고 확대에는 거의 반응하지 않는다. 멀리 있는 것이
          덜 움직여야 깊이가 생긴다. */}
      <group position={[panX * 0.18, -panY * 0.18, 0]} scale={1 + (zoom - 1) * 0.06}>
        <Nebula width={width} height={height} />

        {STAR_LAYERS.map((layer, index) => (
          <StarLayer
            key={`star-layer-${index}`}
            {...layer}
            width={width}
            height={height}
            seed={7919 + index * 104729}
          />
        ))}
      </group>

      {/* 천체는 뷰포트를 그대로 따른다 — RN 레이블 레이어와 같은 변환식(useUniverseViewport). */}
      <group position={[panX, -panY, 0]} scale={zoom}>
        {orbs.map((orb) => (
          <CelestialBody key={orb.id} orb={orb} width={width} height={height} />
        ))}
      </group>
    </>
  );
}

export const UniverseSky = memo(UniverseSkyComponent);
