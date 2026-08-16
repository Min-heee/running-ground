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
import { CelestialSphere } from '@/features/universe/three/CelestialSphere';

// 3D 우주 레이어 (오너 2026-08-15: "실제 우주처럼"). 겹친 반투명 View로 내던 발광체를
// 진짜 구체 + 가산합성 후광으로 바꾼다.
//
// 좌표계: 직교 카메라(zoom 1)라 월드 1 = 화면 1픽셀이다. 원근 투영은 장면(UniverseScene)이
// 이미 끝낸 뒤 **화면 좌표**로 넘겨주고, 여기서는 그 자리에 그리기만 한다 — 투영이 두 벌이면
// 이름표가 천체를 벗어난다. 레이블·터치 영역은 RN View로 위에 그대로 남는다.

export type SkyOrb = {
  id: string;
  // 화면 좌표(배율 1 기준, 좌상단 원점) — RN 레이어와 같은 값.
  x: number;
  y: number;
  diameter: number;
  // 0~1, 서버 계산값.
  brightness: number;
  palette: 'group' | 'galaxy' | 'planet' | 'star' | 'protostar';
  // 가까이서의 모습. 같은 은하라도 멀면 뿌연 덩어리 하나로, 가까우면 수천 점의 나선으로
  // 그려야 한다 — 팔레트에 묶어두면 그 선택을 할 수가 없어서 따로 둔다.
  //   disk   — 나선/타원 파티클 원반 (수백~수천 점, 비싸다)
  //   sphere — 구체 (행성·항성)
  shape: 'disk' | 'sphere';
  // 0이면 아직 먼 빛 한 점, 1이면 완전한 모습. 사이에서는 **둘을 겹쳐** 섞는다.
  // 문턱에서 툭 갈아치우면 확대가 연속이 아니라 전환으로 느껴진다.
  morph: number;
  highlighted?: boolean;
  // 해상 교차 페이드 (0~1). 생략하면 1.
  opacity?: number;
  // 지금 화면에서의 지름(px) — 파티클 점 크기와 정밀도를 정하는 데 쓴다.
  screenDiameter?: number;
  // 깊이(화면 단위). 앞뒤가 겹칠 때 누가 가리는지를 정한다.
  depth?: number;
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
function Nebula({ width, height, fade }: { width: number; height: number; fade: number }) {
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
            opacity={cloud.opacity * fade}
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
  const screenDiameter = orb.screenDiameter ?? orb.diameter;
  const glowScale = radius * 8.5;
  const glowColor = new Color(colors.glow);

  const fade = orb.opacity ?? 1;

  if (fade <= 0.02) {
    return null;
  }

  const morph = Math.max(0, Math.min(1, orb.morph));
  // 깊이는 화면 단위로 온다 — 겹친 천체의 가림 순서를 정하는 데만 쓴다.
  const depth = orb.depth ?? 0;

  return (
    <group position={[worldX, worldY, depth]}>
      {/* 멀리 있는 동안의 모습 — 빛 한 점. 가까워질수록 물러나며 아래의 진짜 모습에
          자리를 내준다. 둘을 겹쳐 섞기 때문에 그 사이에 '갈아치우는 순간'이 없다. */}
      {morph < 0.995 ? (
        <mesh>
          <planeGeometry args={[radius * 6, radius * 6]} />
          <meshBasicMaterial
            map={getGlowTexture()}
            color={glowColor}
            transparent
            opacity={(0.32 + 0.5 * orb.brightness) * fade * (1 - morph)}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ) : null}

      {morph > 0.005 && orb.shape === 'disk' ? (
        <GalaxyDisk
          radius={radius * 2.1}
          brightness={orb.brightness}
          opacity={fade * morph}
          kind={orb.palette === 'galaxy' ? 'galaxy' : 'group'}
          // 문자열 id를 안정적인 시드로 — 같은 지역은 항상 같은 기울기·회전을 갖는다.
          seed={Array.from(orb.id).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647, 7)}
          coreColor={DISK_COLORS[orb.palette === 'galaxy' ? 'galaxy' : 'group'].core}
          armColor={DISK_COLORS[orb.palette === 'galaxy' ? 'galaxy' : 'group'].arm}
          highlighted={orb.highlighted}
          // 점 크기는 화면 기준. 작게 보일 때 점까지 작으면 은하가 사라지고, 크게 볼 때
          // 점이 크면 별이 아니라 물감 덩어리가 된다.
          pointSize={Math.max(1.1, Math.min(3.4, screenDiameter * 0.017))}
        />
      ) : null}

      {morph > 0.005 && orb.shape === 'sphere' ? (
        <>
          {/* 행성 주변의 옅은 빛 — 항성은 자기 코로나를 따로 갖고 있어 여기선 뺀다. */}
          {orb.palette === 'planet' ? (
            <mesh position={[0, 0, -2]}>
              <planeGeometry args={[glowScale, glowScale]} />
              <meshBasicMaterial
                map={getGlowTexture()}
                color={glowColor}
                transparent
                opacity={(0.16 + 0.24 * orb.brightness) * fade * morph}
                depthWrite={false}
                blending={AdditiveBlending}
              />
            </mesh>
          ) : null}

          <CelestialSphere
            id={orb.id}
            palette={orb.palette === 'star' ? 'star' : orb.palette === 'protostar' ? 'protostar' : 'planet'}
            radius={radius}
            screenDiameter={screenDiameter}
            brightness={orb.brightness}
            fade={fade * morph}
          />
        </>
      ) : null}

      {/* 내 천체 — 얇은 링. 색을 바꾸지 않는 건 밝기 정보를 죽이지 않기 위해서다. */}
      {orb.highlighted ? (
        <mesh position={[0, 0, radius * 1.6]}>
          <ringGeometry args={[radius * 1.5, radius * 1.66, 64]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9 * fade} depthWrite={false} />
        </mesh>
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
  zoomFactor = 1,
}: {
  orbs: SkyOrb[];
  width: number;
  height: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  // 처음 배율(나라가 화면에 꽉 차는 배율) 대비 몇 배인지 — 배경을 얼마나 물릴지 정한다.
  zoomFactor?: number;
}) {
  return (
    <>
      {/* 은은한 환경광 — 완전한 암흑을 피하되 명암 경계는 살린다. */}
      <ambientLight intensity={0.28} color="#6E7FB5" />
      <directionalLight position={[-320, 380, 520]} intensity={2.1} color="#EAF1FF" />
      {/* 림 라이트: 카메라 반대편에서 스쳐 들어와 천체 가장자리에 얇은 빛 띠를 남긴다. */}
      <directionalLight position={[420, -280, -360]} intensity={1.5} color="#7FA8FF" />

      {/* 배경은 시차 — pan의 일부만 따라오고 확대에는 거의 반응하지 않는다. 멀리 있는 것이
          덜 움직여야 깊이가 생긴다.
          이동·확대 모두 상한을 둔다: 이 우주는 배율 400배까지 가고 그때 pan은 수만 픽셀이라,
          비례로 따라가면 배경 별밭이 화면 밖으로 통째로 밀려나 칠흑만 남고 성운은 25배로
          부풀어 화면을 하얗게 덮는다. */}
      <group
        position={[
          Math.max(-width, Math.min(width, panX * 0.18)),
          -Math.max(-height, Math.min(height, panY * 0.18)),
          0,
        ]}
        scale={Math.min(1.8, 1 + Math.log2(Math.max(0.25, zoom)) * 0.06)}
      >
        {/* 은하의 성운은 멀리서 볼 때의 배경이다. 한 태양계 안까지 들어와서도 같은 세기로
            깔리면 행성 위에 보랏빛 안개를 씌운 꼴이 되어 표면이 통째로 뿌예진다. */}
        <Nebula
          width={width}
          height={height}
          fade={Math.max(0.1, Math.min(1, 1 - Math.log2(Math.max(1, zoomFactor)) / 7))}
        />

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

      {/* 천체는 이미 투영된 화면 좌표로 온다 — 여기서 다시 변환하지 않는다. 원근 투영은
          아핀이 아니라 그룹 변환으로 표현할 수 없고, 무엇보다 이름표 레이어와 같은 숫자를
          써야 이름이 천체를 벗어나지 않는다. */}
      <group>
        {orbs.map((orb) => (
          <CelestialBody key={orb.id} orb={orb} width={width} height={height} />
        ))}
      </group>
    </>
  );
}

export const UniverseSky = memo(UniverseSkyComponent);
