import type { PlanetKind } from '@/features/universe/three/planetTextures';

// 러너 한 명 = 세계 하나 (오너 2026-08-16: "각 별들은 각각 다른 형태를 띄고 다른 색을 띄고").
//
// 생김새는 전부 아이디에서 결정론적으로 뽑는다. 서버가 내려주는 값이 아니라 **id의 함수**라
// 서, 같은 사람은 언제 어느 기기에서 봐도 같은 세계다 — 어제 본 내 행성이 오늘 다른 색이면
// 그건 내 별이 아니게 된다. 저장할 것도, 서버에 추가할 것도 없다.

export type PlanetTraits = {
  kind: PlanetKind;
  variant: number;
  // 표면 텍스처에 곱하는 색 — 같은 원형도 이걸로 서로 달라 보인다.
  tint: string;
  // 대기 테두리 색과 세기. 없으면 대기가 없는 천체(민둥 바위·얼음).
  atmosphere: { color: string; strength: number } | null;
  // 자전축 기울기(rad)와 자전 속도.
  tilt: number;
  spin: number;
  ring: { inner: number; outer: number; tilt: number } | null;
};

export type StarTraits = {
  // 표면과 코로나 색 — 온도가 높을수록 푸르고, 낮을수록 붉다.
  color: string;
  coronaColor: string;
  spin: number;
  // 코로나 크기 배수.
  corona: number;
};

function seedFrom(id: string): number {
  let hash = 2166136261;

  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

// 시드에서 값을 하나씩 꺼내 쓰는 작은 난수기 — 같은 시드면 언제나 같은 순서.
function sequence(seed: number) {
  let state = seed || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}

const KIND_WEIGHTS: { kind: PlanetKind; weight: number }[] = [
  { kind: 'terrestrial', weight: 0.44 },
  { kind: 'gas', weight: 0.24 },
  { kind: 'barren', weight: 0.2 },
  { kind: 'ice', weight: 0.12 },
];

const ATMOSPHERE_BY_KIND: Record<PlanetKind, { color: string; strength: number } | null> = {
  terrestrial: { color: '#7FB6FF', strength: 0.85 },
  gas: { color: '#FFD9A6', strength: 0.7 },
  ice: { color: '#BFE3FF', strength: 0.5 },
  // 민둥 바위엔 대기가 없다 — 전부에 테두리를 두르면 차이가 사라진다.
  barren: null,
};

export function planetTraitsFor(id: string): PlanetTraits {
  const next = sequence(seedFrom(id));
  const roll = next();
  let cumulative = 0;
  let kind: PlanetKind = 'terrestrial';

  for (const entry of KIND_WEIGHTS) {
    cumulative += entry.weight;

    if (roll <= cumulative) {
      kind = entry.kind;
      break;
    }
  }

  const variant = Math.floor(next() * 97);
  // 흰색 근처에서만 흔든다 — 크게 흔들면 지구가 형광색이 된다.
  const tint = toHex(
    212 + next() * 43,
    212 + next() * 43,
    212 + next() * 43,
  );
  const tilt = (next() - 0.5) * 1.1;
  const spin = 0.05 + next() * 0.16;
  // 고리는 드물어야 특별하다. 가스 행성에 더 잘 생긴다.
  const ringRoll = next();
  const hasRing = kind === 'gas' ? ringRoll < 0.45 : ringRoll < 0.16;

  return {
    kind,
    variant,
    tint,
    atmosphere: ATMOSPHERE_BY_KIND[kind],
    tilt,
    spin,
    ring: hasRing
      ? { inner: 1.5 + next() * 0.3, outer: 2.2 + next() * 0.5, tilt: tilt + (next() - 0.5) * 0.3 }
      : null,
  };
}

// 항성 색 — 실제 항성 분류(O~M)를 눈에 보이는 만큼만 흉내 낸다.
//
// 흰색에 가깝게 두면 안 된다: 표면 무늬는 밝기만 담은 회색 지도라 여기서 곱한 색이 그대로
// 별의 색이 된다. 예전엔 전부 흰색 근처여서 어느 별이든 창백한 달처럼 보였다.
const STAR_COLORS: { color: string; corona: string }[] = [
  { color: '#FFD07A', corona: '#FF9E2E' }, // 태양 비슷한 노란 별
  { color: '#FFAE5C', corona: '#FF7A1F' }, // 주황
  { color: '#FF8A5C', corona: '#FF4E2A' }, // 붉은 거성
  { color: '#BFD8FF', corona: '#6E9BFF' }, // 푸른 별
  { color: '#FFE9C2', corona: '#FFC259' }, // 흰빛에 가까운 별
];

export function starTraitsFor(id: string): StarTraits {
  const next = sequence(seedFrom(id) ^ 0x5f3a);
  const palette = STAR_COLORS[Math.floor(next() * STAR_COLORS.length) % STAR_COLORS.length];

  return {
    color: palette.color,
    coronaColor: palette.corona,
    spin: 0.02 + next() * 0.05,
    corona: 2.4 + next() * 1.1,
  };
}
