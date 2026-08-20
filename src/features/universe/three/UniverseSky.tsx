import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type DataTexture,
  type Group,
  type Points,
  ShaderMaterial,
} from 'three';

import {
  getBlackbodyRamp,
  getDeepGalaxyTexture,
  getGlowTexture,
  getNebulaTexture,
  getSpikedStarTexture,
  getStarPointTexture,
} from '@/features/universe/three/textures';
import { GalaxyDisk } from '@/features/universe/three/GalaxyDisk';
import { HighlightRing } from '@/features/universe/three/HighlightRing';
import { smoothStep } from '@/features/universe/utils/universeSpace';
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
  palette: 'group' | 'galaxy' | 'planet' | 'star';
  // 가까이서의 모습. 같은 은하라도 멀면 뿌연 덩어리 하나로, 가까우면 수천 점의 나선으로
  // 그려야 한다 — 팔레트에 묶어두면 그 선택을 할 수가 없어서 따로 둔다.
  //   disk   — 나선/타원 파티클 원반 (수백~수천 점, 비싸다)
  //   sphere — 구체 (행성·항성)
  shape: 'disk' | 'sphere';
  // 0이면 아직 먼 빛 한 점, 1이면 완전한 모습. 사이에서는 **둘을 겹쳐** 섞는다.
  // 문턱에서 툭 갈아치우면 확대가 연속이 아니라 전환으로 느껴진다.
  morph: number;
  highlighted?: boolean;
  // 표식의 이유 — 내 것(골드)인지 고른 것(얼음빛)인지. 골드는 색 규율상 '내 것'에만 쓴다.
  highlightKind?: 'mine' | 'selected';
  // 해상 교차 페이드 (0~1). 생략하면 1.
  opacity?: number;
  // 지금 화면에서의 지름(px) — 파티클 점 크기와 정밀도를 정하는 데 쓴다.
  screenDiameter?: number;
  // 깊이(화면 단위). 앞뒤가 겹칠 때 누가 가리는지를 정한다.
  depth?: number;
};

// 은하·은하군은 파티클 원반이라 구체 팔레트와 색 규칙이 다르다(핵 → 팔 그라데이션).
//
// 보라를 버렸다 — 흔한 '우주 배경화면'의 색이라 싸 보인다. 두 층은 색상이 아니라 핵의
// 온기와 팔의 채도로 갈린다: 시/도(무리)는 더 창백하고 차분하게, 시/군/구(은하)는 조금
// 더 또렷한 파랑으로. 한 가족의 색 안에서만 논다.
const DISK_COLORS: Record<'group' | 'galaxy', { core: string; arm: string }> = {
  galaxy: { core: '#F5EEDC', arm: '#6E86FF' },
  group: { core: '#F2E9DA', arm: '#5F7BD6' },
};

const PALETTE_COLORS: Record<SkyOrb['palette'], { core: string; glow: string; emissive: number }> = {
  group: { core: '#FFE9C4', glow: '#7E97E8', emissive: 0.85 },
  galaxy: { core: '#FFE9C4', glow: '#7E97E8', emissive: 0.85 },
  planet: { core: '#B7E2FF', glow: '#5F96F0', emissive: 0.55 },
  star: { core: '#FFD467', glow: '#E8B45A', emissive: 1.5 },
};

// 별 배경 3겹 — 깊이별로 크기·밝기·표류 속도가 달라 시차가 생긴다.
//
// 어두운 하늘에서는 별이 **많고 작아야** 우주가 된다 (오너 2026-08-17: "어두운 곳에 빤짝하는
// 별들만 있잖아"). 크고 적으면 점이 아니라 얼룩으로 보인다.
const STAR_LAYERS = [
  { count: 540, z: -420, size: 1.9, opacity: 0.55, drift: 0.004, twinkle: 0.75 },
  { count: 320, z: -260, size: 2.7, opacity: 0.78, drift: 0.009, twinkle: 0.6 },
  { count: 150, z: -140, size: 3.9, opacity: 0.95, drift: 0.016, twinkle: 0.45 },
];

// 은하수 — 하늘을 가로지르는 대각선 리본. 발광 판이 아니라 **밀도**로 그린다: 티끌만 한
// 별 1160개를 가우시안 띠에 몰아넣으면, 광량을 거의 더하지 않고도 밤하늘 사진의 가장 강한
// 단서(은하면)가 생긴다. 통계적으로 고른 별밭은 눈이 '합성'으로 읽는다.
const BAND_ANGLE = -0.55;
const BAND_SIGMA = 0.16;
const BAND_LAYERS = [
  { count: 900, z: -430, size: 1.2, opacity: 0.38, drift: 0.004, twinkle: 0.5 },
  { count: 260, z: -400, size: 1.9, opacity: 0.5, drift: 0.006, twinkle: 0.5 },
];
// 모듈 상수로 두는 이유: 렌더마다 새 객체를 만들면 StarLayer의 지오메트리 useMemo가
// 매 렌더 무효화되어, 확대·이동하는 내내 별밭 버퍼가 다시 만들어진다.
const MILKY_BAND = { angle: BAND_ANGLE, sigma: BAND_SIGMA };
const HERO_WARMTH: [number, number] = [0.55, 1];

// 최원경 — 시차 그룹 **바깥**에 산다. 팬·줌 어디에도 반응하지 않는다: 무한히 먼 것은
// 움직이지 않는 법이고, 덕분에 아무리 깊이 들어가도(시차 그룹이 밀려나 하늘이 성겨져도)
// 화면에는 언제나 이 티끌들이 남는다 — '들어갈수록 비는 하늘'이 '어디에나 있는 우주'가 된다.
const DEEP_DUST_LAYERS = [
  { count: 700, z: -520, size: 1, opacity: 0.3, drift: 0.002, twinkle: 0.35 },
  { count: 420, z: -500, size: 1.4, opacity: 0.4, drift: 0.003, twinkle: 0.4 },
];
// 딥 필드 — 미해상 은하 얼룩들. 허블이 '빈' 하늘에서 찾아낸 그것: 배경이 비어 있는 게
// 아니라 아득할 뿐임을 몇 픽셀짜리 타원들이 말해 준다. 광활함은 여기서 나온다.
// 크기는 gl_PointSize라 **기기 픽셀** 단위다 — dpr 2 화면에서는 절반으로 보인다.
//
// 밀도와 밝기는 '찾으면 보이는' 수준까지 눌렀다 — 딥 필드는 배경의 소음이 아니라
// 들여다본 사람에게 주는 발견이어야 한다. 많고 밝으면 하늘이 지저분해진다.
const DEEP_GALAXY_LAYERS: { variant: 0 | 1 | 2; count: number; z: number; size: number; opacity: number; drift: number; twinkle: number }[] = [
  { variant: 0, count: 34, z: -540, size: 13, opacity: 0.3, drift: 0.0015, twinkle: 0.05 },
  { variant: 1, count: 26, z: -535, size: 17, opacity: 0.24, drift: 0.0012, twinkle: 0.05 },
  { variant: 2, count: 22, z: -530, size: 10, opacity: 0.32, drift: 0.0018, twinkle: 0.05 },
];
const DEEP_GALAXY_WARMTH: [number, number] = [0.32, 0.55];

// 별 하나하나가 제 박자로 깜빡인다. 레이어 전체를 한꺼번에 흔들면 하늘이 통째로 명멸해서
// 별이 아니라 화면이 깜빡이는 것처럼 보인다 — 그래서 위상과 속도를 점마다 심는다.
const STAR_VERTEX = `
attribute float phase;
attribute float twinkleAmount;
attribute float warmth;
uniform float uTime;
uniform float uSize;
uniform float uPixelScale;
varying float vAlpha;
varying float vWarmth;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // 직교 카메라라 거리에 따른 축소가 없다. gl_PointSize는 **기기 픽셀** 단위라
  // uPixelScale(dpr/2)로 화면마다 같은 CSS 크기를 유지한다 — 기준은 dpr 2에서 조율한 look.
  gl_PointSize = uSize * uPixelScale;
  float pulse = 0.5 + 0.5 * sin(uTime * (0.55 + phase * 1.7) + phase * 6.2831853);
  vAlpha = mix(1.0, 0.2 + 0.8 * pulse, twinkleAmount);
  vWarmth = warmth;
}
`;

// 별색은 팔레트가 아니라 온도에서 온다 — warmth(0=주홍 2600K ~ 1=청백 11000K)가 흑체
// 램프를 읽는다. 두 색 사이 보간은 물리에 없는 잿빛 중간을 지나가 별이 바래 보였다.
const STAR_FRAGMENT = `
uniform sampler2D uMap;
uniform sampler2D uRamp;
uniform float uOpacity;
varying float vAlpha;
varying float vWarmth;
void main() {
  float mask = texture2D(uMap, gl_PointCoord).a;
  vec3 tint = texture2D(uRamp, vec2(vWarmth, 0.5)).rgb;
  gl_FragColor = vec4(tint, mask * uOpacity * vAlpha);
}
`;

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
  twinkle,
  width,
  height,
  seed,
  band = null,
  spiked = false,
  texture = null,
  warmthRange = null,
}: {
  count: number;
  z: number;
  size: number;
  opacity: number;
  drift: number;
  twinkle: number;
  width: number;
  height: number;
  seed: number;
  // 있으면 별을 이 각도의 가우시안 리본에 몰아넣는다 — 은하수.
  band?: { angle: number; sigma: number } | null;
  // 밝은 소수의 별에만 회절 십자를 준다.
  spiked?: boolean;
  // 점 스프라이트 텍스처 덮어쓰기 — 딥 필드의 은하 얼룩 등. spiked보다 우선한다.
  texture?: DataTexture | null;
  // warmth 분포 덮어쓰기(히어로 별은 청백 쪽). 없으면 관측 사진의 등급 분포를 따른다.
  warmthRange?: [number, number] | null;
}) {
  const pointsRef = useRef<Points>(null);
  const dpr = useThree((state) => state.viewport.dpr);

  const geometry = useMemo(() => {
    const random = seededRandom(seed);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const amounts = new Float32Array(count);
    const warmths = new Float32Array(count);
    // 화면보다 넉넉히 넓게 뿌린다 — 표류해도 가장자리가 비지 않게.
    const spreadX = width * 1.6;
    const spreadY = height * 1.6;

    for (let index = 0; index < count; index += 1) {
      if (band) {
        // 띠 좌표계 — 띠 방향은 고르게, 수직은 가우시안(Box-Muller)으로.
        const along = (random() - 0.5) * Math.hypot(spreadX, spreadY) * 1.1;
        const gaussian = Math.sqrt(-2 * Math.log(Math.max(1e-9, random())))
          * Math.cos(Math.PI * 2 * random());
        const off = gaussian * height * band.sigma;

        positions[index * 3] = Math.cos(band.angle) * along - Math.sin(band.angle) * off;
        positions[index * 3 + 1] = Math.sin(band.angle) * along + Math.cos(band.angle) * off;
      } else {
        positions[index * 3] = (random() - 0.5) * spreadX;
        positions[index * 3 + 1] = (random() - 0.5) * spreadY;
      }

      positions[index * 3 + 2] = z;
      phases[index] = random();
      // 전부 같은 세기로 깜빡이면 규칙이 눈에 띈다 — 아예 안 깜빡이는 별도 섞는다.
      amounts[index] = random() ** 1.6 * twinkle;

      if (warmthRange) {
        warmths[index] = warmthRange[0] + random() * (warmthRange[1] - warmthRange[0]);
      } else {
        // 등급 한계가 있는 관측 사진의 분포 — 색은 예외의 것이다: 65%는 거의 흰색,
        // 드물게 진짜 주홍(12%)과 사파이어(12%)가 박힌다. 전부 물들이면 색이 사라진다.
        const roll = random();
        warmths[index] = roll < 0.12
          ? random() * 0.25
          : roll < 0.24
            ? 0.75 + random() * 0.25
            : 0.35 + random() * 0.3;
      }
    }

    const buffer = new BufferGeometry();
    buffer.setAttribute('position', new BufferAttribute(positions, 3));
    buffer.setAttribute('phase', new BufferAttribute(phases, 1));
    buffer.setAttribute('twinkleAmount', new BufferAttribute(amounts, 1));
    buffer.setAttribute('warmth', new BufferAttribute(warmths, 1));
    return buffer;
  }, [band, count, height, seed, twinkle, warmthRange, width, z]);

  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uPixelScale: { value: 1 },
      uOpacity: { value: opacity },
      uMap: { value: texture ?? (spiked ? getSpikedStarTexture() : getStarPointTexture()) },
      uRamp: { value: getBlackbodyRamp() },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }), [opacity, size, spiked, texture]);

  material.uniforms.uPixelScale.value = dpr * 0.5;

  // 재질도 기하도 이 컴포넌트가 만들었으니 이 컴포넌트가 반납한다 — 화면을 오갈 때마다
  // GPU에 버퍼와 셰이더 프로그램이 쌓이면 안 된다.
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    if (pointsRef.current) {
      // 아주 느린 표류 — 정지 화면이 아니라 살아있는 하늘로 보이게 하는 최소한의 움직임.
      pointsRef.current.rotation.z += delta * drift * 0.05;
    }
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// 성운 — 필라멘트 판 몇 장을 서로 다른 색·크기·회전으로 겹친다.
//
// 깊고 어두운 남색 계열만 쓴다. 밝은 보라·자홍을 가산합성으로 겹치면 하늘이 통째로 들려
// 올라가 별이 배경에 묻힌다 — 성운은 '보이는 것'이 아니라 '있는 줄 아는 것'이어야 한다.
// 판마다 표류 속도가 달라 실타래 층이 서로 미끄러진다 — 값싼 체적감.
function Nebula({ width, height, fade }: { width: number; height: number; fade: number }) {
  const plateRefs = useRef<(Group | null)[]>([]);
  const clouds = useMemo(() => {
    const random = seededRandom(20260815);
    const palette = ['#101430', '#0C1A3C', '#111B3A', '#1E1240'];

    // 장수를 줄인다. 화면을 덮는 판은 한 장이 늘 때마다 하늘의 바닥이 그만큼 올라간다.
    return Array.from({ length: 4 }, (_, index) => {
      const scale = Math.min(width, height) * (1.05 + random() * 1.15);

      return {
        key: `cloud-${index}`,
        x: (random() - 0.5) * width * 1.45,
        y: (random() - 0.5) * height * 1.45,
        z: -340 + index * 14,
        scaleX: scale,
        // 완벽한 원은 도형이다 — 눌러서 늘인다.
        scaleY: scale * (0.5 + random() * 0.45),
        rotation: random() * Math.PI,
        color: palette[index % palette.length],
        opacity: 0.42 + random() * 0.3,
        variant: (index % 2) as 0 | 1,
        drift: (0.7 + random() * 0.6) * (index % 2 === 0 ? 1 : -1),
      };
    });
  }, [height, width]);

  useFrame((_, delta) => {
    clouds.forEach((cloud, index) => {
      const plate = plateRefs.current[index];

      if (plate) {
        plate.rotation.z += delta * 0.006 * cloud.drift;
      }
    });
  });

  return (
    <>
      {clouds.map((cloud, index) => (
        <group
          key={cloud.key}
          position={[cloud.x, cloud.y, cloud.z]}
          ref={(node) => {
            plateRefs.current[index] = node;
          }}
        >
          <mesh rotation={[0, 0, cloud.rotation]} scale={[cloud.scaleX, cloud.scaleY, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={getNebulaTexture(cloud.variant)}
              color={new Color(cloud.color)}
              transparent
              opacity={cloud.opacity * fade}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// 암흑 성간운 — 은하수 리본을 따라 놓이는 **어두운** 조각들. 대은하수의 그레이트 리프트가
// 그렇듯, 별의 강 위에 빛을 삼키는 균열이 있어야 띠가 리본이 아니라 은하면으로 읽힌다.
// 일반 합성이라 화면을 어둡게만 한다.
function GreatRift({ width, height, fade }: { width: number; height: number; fade: number }) {
  const patches = useMemo(() => {
    const random = seededRandom(8151923);
    const reach = Math.hypot(width, height);

    return Array.from({ length: 4 }, (_, index) => {
      const along = (index / 3 - 0.5) * reach * 0.85 + (random() - 0.5) * width * 0.2;
      const off = (random() - 0.5) * height * 0.1;
      const scale = Math.min(width, height) * (0.55 + random() * 0.5);

      return {
        key: `rift-${index}`,
        x: Math.cos(BAND_ANGLE) * along - Math.sin(BAND_ANGLE) * off,
        y: Math.sin(BAND_ANGLE) * along + Math.cos(BAND_ANGLE) * off,
        // 띠의 별(-430, -400)보다 앞 — 뒤의 별빛을 실제로 가린다.
        z: -336 + index * 5,
        scaleX: scale,
        scaleY: scale * 0.35,
        rotation: BAND_ANGLE + (random() - 0.5) * 0.24,
        opacity: 0.5 + random() * 0.15,
        variant: (index % 2) as 0 | 1,
      };
    });
  }, [height, width]);

  return (
    <>
      {patches.map((patch) => (
        <mesh
          key={patch.key}
          position={[patch.x, patch.y, patch.z]}
          rotation={[0, 0, patch.rotation]}
          scale={[patch.scaleX, patch.scaleY, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={getNebulaTexture(patch.variant)}
            color={new Color('#04050A')}
            transparent
            opacity={patch.opacity * fade}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

// 유성 — 40초에 한 번쯤, 기대를 접었을 때 떨어지는 한 줄기. 점 24개의 위치·꼬리가 전부
// 유니폼이라 살아 있는 시간(<1초/분) 외의 비용은 없다. 대부분의 방문자는 정확히 한 번
// 본다 — 그 희소함이 누군가를 불러 앉히는 장면을 만든다.
const METEOR_VERTEX = `
attribute float aT;
uniform vec2 uStart;
uniform vec2 uDir;
uniform float uHead;
uniform float uLen;
uniform float uPixelScale;
varying float vT;
void main() {
  vec2 planar = uStart + uDir * (uHead - aT * uLen);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(planar, position.z, 1.0);
  gl_PointSize = mix(2.8, 0.7, aT) * uPixelScale;
  vT = aT;
}
`;

const METEOR_FRAGMENT = `
uniform sampler2D uMap;
uniform float uEnvelope;
uniform vec3 uGold;
varying float vT;
void main() {
  float mask = texture2D(uMap, gl_PointCoord).a;
  float alpha = mask * pow(1.0 - vT, 2.2) * uEnvelope;
  gl_FragColor = vec4(mix(vec3(1.0), uGold, vT * 0.35), alpha);
}
`;

const METEOR_POINTS = 24;

function ShootingStar({ width, height, enabled }: { width: number; height: number; enabled: boolean }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(METEOR_POINTS * 3);
    const ts = new Float32Array(METEOR_POINTS);

    for (let index = 0; index < METEOR_POINTS; index += 1) {
      positions[index * 3 + 2] = -160;
      ts[index] = index / (METEOR_POINTS - 1);
    }

    const buffer = new BufferGeometry();
    buffer.setAttribute('position', new BufferAttribute(positions, 3));
    buffer.setAttribute('aT', new BufferAttribute(ts, 1));
    return buffer;
  }, []);

  const dpr = useThree((state) => state.viewport.dpr);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uStart: { value: [0, 0] },
      uDir: { value: [1, 0] },
      uHead: { value: 0 },
      uLen: { value: 100 },
      uEnvelope: { value: 0 },
      uPixelScale: { value: 1 },
      uMap: { value: getStarPointTexture() },
      // 흰 머리가 식으며 샴페인 골드로 — 색 규율의 골드가 여기서도 '순간의 보상'이다.
      uGold: { value: new Color('#E8C87A') },
    },
    vertexShader: METEOR_VERTEX,
    fragmentShader: METEOR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }), []);

  material.uniforms.uPixelScale.value = dpr * 0.5;

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const flight = useRef<{ bornAt: number; life: number; travel: number } | null>(null);
  // 첫 유성은 조금 이르게 — 머문 사람이 보게.
  const nextAt = useRef(14 + Math.random() * 12);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const { uniforms } = material;

    if (!flight.current) {
      // 은하 안까지 들어와 있으면 쏘지 않는다 — 유성은 넓은 하늘의 것이다.
      if (enabledRef.current && now >= nextAt.current) {
        const angle = -(25 + Math.random() * 15) * (Math.PI / 180);
        const flip = Math.random() < 0.5 ? -1 : 1;
        const length = 90 + Math.random() * 50;

        uniforms.uStart.value = [
          (Math.random() - 0.5) * width * 1.1,
          // 월드 y는 위가 + — 하늘의 위쪽 2/3에서 태어난다.
          height * (Math.random() * 0.33 + 0.05),
        ];
        uniforms.uDir.value = [Math.cos(angle) * flip, Math.sin(angle)];
        uniforms.uLen.value = length;
        flight.current = { bornAt: now, life: 0.75, travel: length * 2.4 };
      }

      return;
    }

    const progress = (now - flight.current.bornAt) / flight.current.life;

    if (progress >= 1) {
      uniforms.uEnvelope.value = 0;
      flight.current = null;
      // 30초보다 잦으면 사건이 아니라 파티클 이펙트가 된다.
      nextAt.current = now + 32 + Math.random() * 16;
      return;
    }

    uniforms.uHead.value = (1 - (1 - progress) ** 3) * flight.current.travel;
    uniforms.uEnvelope.value = Math.sin(Math.PI * progress) * 0.85;
  });

  // 위치가 전부 유니폼에 있어 지오메트리는 원점 한 점 — 바운딩 구가 0이라 그룹이 밀리면
  // 프러스텀 컬링이 유성을 통째로 걸러 버린다. 스물네 점짜리 드로우 하나라 컬링을 끈다.
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function CelestialBody({ orb, width, height }: { orb: SkyOrb; width: number; height: number }) {
  const colors = PALETTE_COLORS[orb.palette];
  // 화면 좌표(좌상단 원점) → 월드 좌표(중앙 원점, y 위로).
  const worldX = orb.x - width / 2;
  const worldY = height / 2 - orb.y;
  const radius = orb.diameter / 2;
  const screenDiameter = orb.screenDiameter ?? orb.diameter;
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
        // 판은 단위 크기, 확대는 mesh scale로 — 지오메트리 인자에 화면 반지름을 넣으면
        // 확대하는 매 프레임 모든 천체의 버퍼가 새로 만들어진다(실측된 최대 GPU 낭비).
        <mesh scale={[radius * 4.6, radius * 4.6, 1]}>
          {/* 멀리 있는 것은 작고 흐려야 멀어 보인다. 크고 밝은 솜뭉치로 그리면 은하가
              아니라 화면에 묻은 얼룩이 된다. */}
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={getGlowTexture()}
            color={glowColor}
            transparent
            opacity={(0.2 + 0.34 * orb.brightness) * fade * (1 - morph)}
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
          highlightColor={orb.highlightKind === 'mine' ? '#E8C87A' : '#D6E4FF'}
          // 화면을 덮기 시작하면 핵을 접는다 — 그 크기에서 핵은 후광이 아니라 장막이고,
          // 확대된 방사형 텍스처의 끝이 원형 테두리로 드러난다.
          coreFade={1 - smoothStep(0.55, 1, screenDiameter / Math.max(1, Math.min(width, height)))}
          // 점 크기는 화면 기준. 작게 보일 때 점까지 작으면 은하가 사라지고, 크게 볼 때
          // 점이 크면 별이 아니라 물감 덩어리가 된다.
          pointSize={Math.max(1.1, Math.min(3.4, screenDiameter * 0.017))}
        />
      ) : null}

      {morph > 0.005 && orb.shape === 'sphere' ? (
        <>
          {/* 행성에는 후광이 없다 — 스스로 빛나는 것은 항성뿐이다(오너 2026-08-19: "행성에서
              너무 과한 빛이 나"). 예전의 가산 후광 판은 행성을 램프로 만들었다. 행성의
              빛은 표면의 반사광과 대기 가장자리의 얇은 테두리로 충분하다. */}
          <CelestialSphere
            id={orb.id}
            palette={orb.palette === 'star' ? 'star' : 'planet'}
            radius={radius}
            screenDiameter={screenDiameter}
            brightness={orb.brightness}
            fade={fade * morph}
          />
        </>
      ) : null}

      {/* 내 천체/고른 천체 — 숨쉬는 1px 링. 내 것은 골드, 고른 것은 얼음빛. */}
      {orb.highlighted && orb.shape === 'sphere' ? (
        <group position={[0, 0, radius * 1.6]}>
          <HighlightRing
            color={orb.highlightKind === 'mine' ? '#E8C87A' : '#D6E4FF'}
            opacity={fade}
            scale={radius * 3.19}
          />
        </group>
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
  // 별 개수는 화면 **면적**을 따라간다 — 개수가 고정이면 폰 화면에서는 같은 별들이 1/4
  // 면적에 몰려 하늘이 눈보라가 되고, 초광폭 모니터에서는 성겨진다. 밀도가 상수여야
  // 어느 화면에서든 같은 하늘이다.
  const areaScale = Math.max(0.3, Math.min(1.4, (width * height) / 480000));

  return (
    <>
      {/* 은은한 환경광 — 완전한 암흑을 피하되 명암 경계는 살린다. 우주에는 하늘빛이 없어서
          이 값이 크면 행성의 밤면까지 밝아지고, 그러면 구가 아니라 스티커로 보인다. */}
      <ambientLight intensity={0.13} color="#5D6B9E" />
      <directionalLight position={[-320, 380, 520]} intensity={2.2} color="#EAF1FF" />
      {/* 림 라이트: 카메라 반대편에서 스쳐 들어와 천체 가장자리에 얇은 빛 띠를 남긴다. */}
      <directionalLight position={[420, -280, -360]} intensity={1.1} color="#7FA8FF" />

      {/* 최원경: 딥 필드 은하들과 가장 고운 별먼지 — 시차 그룹 바깥, 어디에도 붙지 않는
          붙박이 하늘. 깊이 들어갈수록 시차 배경이 밀려나 성겨질 때 이 층이 바닥을 받친다. */}
      {DEEP_GALAXY_LAYERS.map((layer) => (
        <StarLayer
          key={`deep-galaxy-${layer.variant}`}
          count={Math.round(layer.count * areaScale)}
          z={layer.z}
          size={layer.size}
          opacity={layer.opacity}
          drift={layer.drift}
          twinkle={layer.twinkle}
          width={width}
          height={height}
          seed={31091 + layer.variant * 7717}
          texture={getDeepGalaxyTexture(layer.variant)}
          warmthRange={DEEP_GALAXY_WARMTH}
        />
      ))}

      {DEEP_DUST_LAYERS.map((layer, index) => (
        <StarLayer
          key={`deep-dust-${index}`}
          {...layer}
          count={Math.round(layer.count * areaScale)}
          width={width}
          height={height}
          seed={52501 + index * 9973}
        />
      ))}

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

        <GreatRift
          width={width}
          height={height}
          fade={Math.max(0.1, Math.min(1, 1 - Math.log2(Math.max(1, zoomFactor)) / 7))}
        />

        {STAR_LAYERS.map((layer, index) => (
          <StarLayer
            key={`star-layer-${index}`}
            {...layer}
            count={Math.round(layer.count * areaScale)}
            width={width}
            height={height}
            seed={7919 + index * 104729}
          />
        ))}

        {/* 은하수 — 티끌 별들의 리본. */}
        {BAND_LAYERS.map((layer, index) => (
          <StarLayer
            key={`band-layer-${index}`}
            {...layer}
            count={Math.round(layer.count * areaScale)}
            width={width}
            height={height}
            seed={1913 + index * 60013}
            band={MILKY_BAND}
          />
        ))}

        {/* 히어로 별 — 스물넷의 큰 별에만 회절 십자를 준다. 수천의 티끌 대 스물넷의 광휘,
            그 위계가 장노출 사진의 등급 분포다. */}
        <StarLayer
          count={Math.max(10, Math.round(24 * areaScale))}
          z={-180}
          size={13}
          opacity={0.8}
          drift={0.012}
          twinkle={0.35}
          width={width}
          height={height}
          seed={424243}
          spiked
          warmthRange={HERO_WARMTH}
        />

        <ShootingStar width={width} height={height} enabled={zoomFactor < 3} />
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
