import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
} from 'three';

import { getGlowTexture, getStarPointTexture } from '@/features/universe/three/textures';

// 나선은하 (오너 2026-08-15: "은하가 저렇게 생기진 않았잖아"). 발광하는 공이 아니라 실제
// 은하의 형태 — 밝은 핵 + 로그나선 팔 + 얇은 원반 + 기울기 — 를 파티클로 만든다.
//
// 층마다 형태가 다르다: 은하(시/군/구)는 나선, 은하군(시/도)은 여러 은하가 모인 타원형
// 무리. 층이 바뀌면 생김새가 바뀌므로 지금 어느 층에 있는지가 눈으로도 읽힌다.

const BRANCHES = 3;
// 팔이 감기는 정도. 크면 소용돌이가 조밀해진다.
const SPIN = 2.6;
// 팔에서 흩어지는 정도 — 0이면 실처럼 가늘어 부자연스럽다.
const RANDOMNESS = 0.42;
const RANDOMNESS_POWER = 2.8;

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
  const mixed = new Color();

  for (let index = 0; index < count; index += 1) {
    // 중심으로 갈수록 조밀 — 제곱근 분포라 핵이 밝고 바깥이 성기다.
    const distance = Math.pow(random(), 0.62) * radius;
    const branchAngle = ((index % BRANCHES) / BRANCHES) * Math.PI * 2;
    const spinAngle = kind === 'galaxy' ? distance * (SPIN / radius) : 0;

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

    positions[index * 3] = Math.cos(angle) * distance + scatterX;
    positions[index * 3 + 1] = Math.sin(angle) * distance + scatterY;
    // 두께는 화면 깊이 방향(z)으로만 — 원반이 화면과 나란해 정면으로 보인다.
    positions[index * 3 + 2] = scatterZ * flatten;

    mixed.copy(coreColor).lerp(armColor, Math.min(1, distance / radius));
    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function GalaxyDiskComponent({
  radius,
  brightness,
  kind,
  seed,
  coreColor,
  armColor,
  highlighted = false,
}: {
  radius: number;
  brightness: number;
  kind: DiskKind;
  seed: number;
  coreColor: string;
  armColor: string;
  highlighted?: boolean;
}) {
  const groupRef = useRef<Group>(null);

  // 파티클 수는 크기에 비례하되 상한을 둔다 — 25개 은하가 한 화면에 뜨므로 총량이 중요하다.
  const count = Math.round(Math.min(1700, Math.max(420, radius * 26)));
  const geometry = useMemo(
    () => buildDiskGeometry({
      count,
      radius,
      kind,
      seed,
      coreColor: new Color(coreColor),
      armColor: new Color(armColor),
    }),
    [armColor, coreColor, count, kind, radius, seed],
  );

  // 기울기 — 정면(-PI/2)에서 조금 틀어 원반이 타원으로 보이게. 시드로 은하마다 다르게.
  const tilt = useMemo(() => {
    const random = seeded(seed + 977);
    // 0.35~0.85 rad(20~49°) — 원반이 타원으로 보이되 선으로 찌그러지지 않는 범위.
    return 0.35 + random() * 0.5;
  }, [seed]);
  const yaw = useMemo(() => seeded(seed + 31)() * Math.PI * 2, [seed]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // 은하는 스스로 돈다. 한 바퀴 ~2분 — 눈에 띄되 산만하지 않은 속도.
      groupRef.current.rotation.z += delta * 0.055;
    }
  });

  return (
    <group rotation={[tilt, 0, yaw]}>
      {/* 핵 — 원반 중심의 밝은 덩어리. 이게 없으면 팔만 떠 있어 은하로 안 읽힌다. */}
      <mesh>
        <planeGeometry args={[radius * 2.6, radius * 2.6]} />
        <meshBasicMaterial
          map={getGlowTexture()}
          color={new Color(coreColor)}
          transparent
          opacity={0.5 + 0.45 * brightness}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <group ref={groupRef}>
        <points geometry={geometry}>
          <pointsMaterial
            size={Math.max(1.6, radius * 0.14)}
            map={getStarPointTexture()}
            vertexColors
            transparent
            opacity={0.55 + 0.45 * brightness}
            depthWrite={false}
            blending={AdditiveBlending}
            sizeAttenuation={false}
          />
        </points>
      </group>

      {/* 내 지역 — 원반을 감싸는 얇은 링(정면으로 눕혀 원반과 같은 평면에 놓는다). */}
      {highlighted ? (
        <mesh>
          <ringGeometry args={[radius * 1.5, radius * 1.62, 64]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export const GalaxyDisk = memo(GalaxyDiskComponent);
