import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

// 행성 표면 (오너 2026-08-16: "진짜 행성·항성처럼, 각 별이 각각 다른 형태와 색을").
//
// 색만 다른 매끈한 공은 행성으로 안 읽힌다. 대륙과 바다, 구름, 대기의 테두리, 고리 — 그게
// 있어야 '별'이 된다. 그래서 표면을 절차적으로 만든다: 이미지 파일이 없어도 되고(웹 배포와
// 앱 용량 모두에 이득), 무엇보다 러너 수만큼 서로 다른 세계를 만들 수 있다.
//
// 잡음은 구면 위 3D로 판다. 평면(등장방형) 위에서 파면 좌우 끝이 안 맞아 지도에 세로선이
// 생긴다 — 구면 좌표를 xyz로 바꿔 넣으면 이음매가 원천적으로 없다.
//
// 비용 관리: 텍스처는 러너마다 만들지 않는다. **원형 몇 벌**을 만들어 캐시하고, 러너별
// 차이는 그 위에 곱하는 색·자전 속도·기울기·고리 유무로 낸다. 60명이 한 화면에 뜰 수 있는
// 곳에서 1인 1텍스처는 첫 프레임에 수백 밀리초를 태운다.

// 행성이 화면을 거의 채울 만큼 다가갈 수 있으므로 표면 지도가 촘촘해야 한다. 256×128일
// 때는 가까이 가면 대륙 가장자리가 뭉개졌다. 원형 몇 벌만 만들어 캐시하므로 비용은
// 한 번뿐이고, 512×256이라도 한 장에 0.5MB 정도다.
const SURFACE_WIDTH = 512;
const SURFACE_HEIGHT = 256;
const CLOUD_WIDTH = 384;
const CLOUD_HEIGHT = 192;

export type PlanetKind = 'terrestrial' | 'gas' | 'barren' | 'ice';

// 원형 개수 — 이만큼이면 한 동네 안에서 같은 세계가 눈에 띄게 반복되지 않는다.
const VARIANTS: Record<PlanetKind, number> = {
  terrestrial: 4,
  gas: 3,
  barren: 3,
  ice: 2,
};

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1013904223;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// 3D 값 잡음 — 격자에서 뽑아 삼선형 보간. 품질보다 재현성과 속도가 중요하다.
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);

  return lerp(
    lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
    lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
    zf,
  );
}

function fbm(x: number, y: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency, z * frequency, seed + octave * 131) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }

  return sum / total;
}

type Rgb = [number, number, number];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// 지구형 팔레트 — 심해 / 얕은 바다 / 해안 / 초목 / 고지대 / 만년설.
const TERRESTRIAL_PALETTES: { deep: Rgb; shallow: Rgb; shore: Rgb; land: Rgb; high: Rgb; polar: Rgb }[] = [
  // 지구
  { deep: [8, 26, 74], shallow: [22, 78, 150], shore: [196, 182, 128], land: [46, 110, 58], high: [124, 108, 82], polar: [238, 244, 250] },
  // 붉은 사막 세계
  { deep: [42, 18, 22], shallow: [96, 44, 38], shore: [186, 122, 74], land: [158, 84, 48], high: [206, 158, 118], polar: [232, 224, 214] },
  // 청록 외계 초목
  { deep: [6, 34, 52], shallow: [16, 92, 108], shore: [172, 196, 168], land: [42, 132, 110], high: [96, 150, 132], polar: [226, 240, 240] },
  // 보랏빛 세계
  { deep: [26, 12, 54], shallow: [62, 40, 118], shore: [178, 150, 200], land: [104, 62, 144], high: [150, 118, 176], polar: [236, 230, 246] },
];

const GAS_PALETTES: { base: Rgb; band: Rgb; storm: Rgb }[] = [
  { base: [196, 156, 104], band: [232, 208, 168], storm: [204, 108, 74] },
  { base: [116, 146, 190], band: [188, 214, 238], storm: [96, 118, 166] },
  { base: [150, 74, 68], band: [206, 142, 112], storm: [232, 190, 150] },
];

const BARREN_PALETTES: { low: Rgb; high: Rgb }[] = [
  { low: [78, 78, 84], high: [156, 154, 148] },
  { low: [92, 62, 48], high: [166, 126, 96] },
  { low: [42, 44, 52], high: [104, 106, 116] },
];

const ICE_PALETTES: { low: Rgb; high: Rgb }[] = [
  { low: [128, 168, 202], high: [242, 250, 255] },
  { low: [96, 122, 158], high: [214, 230, 246] },
];

// ── 행 단위 재개형 베이크 (2026-08-26 '로딩 중 조작' 사고) ─────────────────────────
// 무거운 텍스처(512×256 fbm)는 Hermes에서 장당 350-800ms다. 통째로 구우면 그 프레임이
// 통째로 멎는다 — 로딩 홀드 안이든, 상한에 잘린 꼬리를 나중에 굽든, 구워지는 그 순간
// 사용자가 조작 중이면 1초급 멈칫이 된다(오너 영상 실측 880-2254ms). 그래서 모든 무거운
// 베이크를 **행 단위로 재개**할 수 있게 쪼갠다: step(deadline)이 마감까지 행을 굽고
// 멈추며, 마지막 행에서 텍스처를 완성해 캐시에 넣는다. 행 하나(512픽셀 fbm)는 ~1-3ms라
// 마감 초과는 그 정도로 바운드된다. 수학은 예전 몸통 그대로 — 한 픽셀도 다르면 안 된다.
type SlicedTextureSpec = {
  width: number;
  height: number;
  renderRow: (y: number, data: Uint8Array) => void;
  finalize: (texture: DataTexture) => void;
};

type SlicedTextureJob = { isDone: () => boolean; step: (deadlineMs: number) => void };

function createSlicedTextureJob(spec: SlicedTextureSpec): SlicedTextureJob {
  const data = new Uint8Array(spec.width * spec.height * 4);
  let y = 0;
  let done = false;

  return {
    isDone: () => done,
    step(deadlineMs: number) {
      if (done) {
        return;
      }

      while (y < spec.height) {
        spec.renderRow(y, data);
        y += 1;

        if (Date.now() >= deadlineMs) {
          break;
        }
      }

      if (y >= spec.height) {
        const texture = new DataTexture(data, spec.width, spec.height, RGBAFormat, UnsignedByteType);
        spec.finalize(texture);
        done = true;
      }
    },
  };
}

function surfaceRowRenderer(kind: PlanetKind, variant: number): (y: number, data: Uint8Array) => void {
  const seed = (kind.length * 7919 + variant * 104729) % 2147483647;

  return (y: number, data: Uint8Array) => {
    // v를 위도로: 극지방 처리를 위해 -1(남극) ~ 1(북극).
    const v = y / (SURFACE_HEIGHT - 1);
    const latitude = Math.cos(v * Math.PI);
    const sinTheta = Math.sin(v * Math.PI);

    for (let x = 0; x < SURFACE_WIDTH; x += 1) {
      const u = x / SURFACE_WIDTH;
      const phi = u * Math.PI * 2;
      // 구면 위의 점 — 이음매 없는 잡음을 위해.
      const nx = sinTheta * Math.cos(phi);
      const ny = latitude;
      const nz = sinTheta * Math.sin(phi);
      let color: Rgb;

      if (kind === 'gas') {
        const palette = GAS_PALETTES[variant % GAS_PALETTES.length];
        // 가스 행성은 위도 방향 띠 — 난류로 띠를 구불거리게 만든다.
        const turbulence = fbm(nx * 2.4, ny * 2.4, nz * 2.4, seed, 4);
        const bands = Math.sin((v * 18 + turbulence * 2.6) * Math.PI);
        color = mix(palette.base, palette.band, bands * 0.5 + 0.5);

        // 대적점 같은 소용돌이 하나.
        const stormDistance = Math.hypot(u - 0.68, (v - 0.6) * 2.1);
        if (stormDistance < 0.12) {
          color = mix(color, palette.storm, (1 - stormDistance / 0.12) ** 1.6);
        }
      } else if (kind === 'terrestrial') {
        const palette = TERRESTRIAL_PALETTES[variant % TERRESTRIAL_PALETTES.length];
        const elevation = fbm(nx * 2.1, ny * 2.1, nz * 2.1, seed, 5);
        const detail = fbm(nx * 7.3, ny * 7.3, nz * 7.3, seed + 17, 3);
        const height = elevation * 0.82 + detail * 0.18;
        const seaLevel = 0.5;

        if (height < seaLevel - 0.08) {
          color = mix(palette.deep, palette.shallow, (height - 0.3) / 0.12);
        } else if (height < seaLevel) {
          color = mix(palette.shallow, palette.shore, (height - (seaLevel - 0.08)) / 0.08);
        } else if (height < seaLevel + 0.16) {
          color = mix(palette.shore, palette.land, (height - seaLevel) / 0.16);
        } else {
          color = mix(palette.land, palette.high, (height - (seaLevel + 0.16)) / 0.2);
        }

        // 만년설 — 극지방일수록, 고지대일수록.
        const polar = Math.max(0, Math.abs(latitude) - 0.72) / 0.28;
        if (polar > 0) {
          color = mix(color, palette.polar, polar ** 0.7);
        }
      } else {
        const palette = kind === 'ice'
          ? ICE_PALETTES[variant % ICE_PALETTES.length]
          : BARREN_PALETTES[variant % BARREN_PALETTES.length];
        const rough = fbm(nx * 3.4, ny * 3.4, nz * 3.4, seed, 4);
        const craters = fbm(nx * 9.1, ny * 9.1, nz * 9.1, seed + 41, 2);
        color = mix(palette.low, palette.high, rough * 0.7 + craters * 0.3);
      }

      const index = (y * SURFACE_WIDTH + x) * 4;
      data[index] = Math.round(color[0]);
      data[index + 1] = Math.round(color[1]);
      data[index + 2] = Math.round(color[2]);
      data[index + 3] = 255;
    }
  };
}

// 가로는 한 바퀴 돌아 이어지고, 세로(극)는 잘린다 — 모든 구면 텍스처 공통 마무리.
function finalizeSphericalTexture(texture: DataTexture) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
}

const surfaceCache = new Map<string, DataTexture>();
const maskCache = new Map<number, DataTexture>();

// 지구형 행성의 마스크 — R: 도시 불빛(육지·중위도·덩어리진), G: 바다.
//
// 표면 텍스처의 알파에 싣지 않고 **따로** 만든다: 해상 교차 페이드 중에는 재질이
// transparent가 되는데, 그때 지도의 알파가 255 미만이면 행성이 반투명해져 뒤가 비친다.
// 같은 시드·같은 고도 공식을 쓰므로 바다 마스크는 표면의 바다와 정확히 겹친다.
const MASK_WIDTH = 256;
const MASK_HEIGHT = 128;

function maskRowRenderer(safeVariant: number): (y: number, data: Uint8Array) => void {
  const width = MASK_WIDTH;
  const height = MASK_HEIGHT;
  const seed = ('terrestrial'.length * 7919 + safeVariant * 104729) % 2147483647;
  const seaLevel = 0.5;

  return (y: number, data: Uint8Array) => {
    const v = y / (height - 1);
    const latitude = Math.cos(v * Math.PI);
    const sinTheta = Math.sin(v * Math.PI);

    for (let x = 0; x < width; x += 1) {
      const phi = (x / width) * Math.PI * 2;
      const nx = sinTheta * Math.cos(phi);
      const ny = latitude;
      const nz = sinTheta * Math.sin(phi);
      // buildSurface의 지구형 분기와 같은 공식 — 어긋나면 바다 위에 도시가 뜬다.
      const elevation = fbm(nx * 2.1, ny * 2.1, nz * 2.1, seed, 5);
      const detail = fbm(nx * 7.3, ny * 7.3, nz * 7.3, seed + 17, 3);
      const terrain = elevation * 0.82 + detail * 0.18;

      const water = Math.max(0, Math.min(1, (seaLevel - terrain) / 0.02));
      const sprawl = fbm(nx * 11, ny * 11, nz * 11, seed + 77, 2);
      const habitable = terrain >= seaLevel && Math.abs(latitude) < 0.75;
      const city = habitable ? Math.max(0, (sprawl - 0.63) / 0.37) ** 1.4 : 0;

      const index = (y * width + x) * 4;
      data[index] = Math.round(Math.min(1, city) * 255);
      data[index + 1] = Math.round(water * 255);
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  };
}

const maskJobs = new Map<number, SlicedTextureJob>();

function maskJobFor(safeVariant: number): SlicedTextureJob {
  const existing = maskJobs.get(safeVariant);

  if (existing) {
    return existing;
  }

  const job = createSlicedTextureJob({
    width: MASK_WIDTH,
    height: MASK_HEIGHT,
    renderRow: maskRowRenderer(safeVariant),
    finalize: (texture) => {
      finalizeSphericalTexture(texture);
      maskCache.set(safeVariant, texture);
      maskJobs.delete(safeVariant);
    },
  });
  maskJobs.set(safeVariant, job);
  return job;
}

export function getPlanetMask(variant: number): DataTexture {
  const safeVariant = Math.abs(variant) % VARIANTS.terrestrial;
  const cached = maskCache.get(safeVariant);

  if (cached) {
    return cached;
  }

  // 캐시 미스의 동기 폴백 — 진행 중이던 조각 작업이 있으면 그걸 끝까지 돌린다(이중 작업
  // 없음). 펌프가 다 덮은 뒤에는 사실상 도달하지 않는 안전망이다.
  maskJobFor(safeVariant).step(Number.POSITIVE_INFINITY);
  return maskCache.get(safeVariant) as DataTexture;
}

const surfaceJobs = new Map<string, SlicedTextureJob>();

function surfaceJobFor(kind: PlanetKind, safeVariant: number): SlicedTextureJob {
  const key = `${kind}:${safeVariant}`;
  const existing = surfaceJobs.get(key);

  if (existing) {
    return existing;
  }

  const job = createSlicedTextureJob({
    width: SURFACE_WIDTH,
    height: SURFACE_HEIGHT,
    renderRow: surfaceRowRenderer(kind, safeVariant),
    finalize: (texture) => {
      finalizeSphericalTexture(texture);
      surfaceCache.set(key, texture);
      surfaceJobs.delete(key);
    },
  });
  surfaceJobs.set(key, job);
  return job;
}

export function getPlanetSurface(kind: PlanetKind, variant: number): DataTexture {
  const safeVariant = Math.abs(variant) % VARIANTS[kind];
  const cached = surfaceCache.get(`${kind}:${safeVariant}`);

  if (cached) {
    return cached;
  }

  surfaceJobFor(kind, safeVariant).step(Number.POSITIVE_INFINITY);
  return surfaceCache.get(`${kind}:${safeVariant}`) as DataTexture;
}

let cloudTexture: DataTexture | null = null;
let cloudJob: SlicedTextureJob | null = null;

// 구름 — 알파만 있는 흰 층. 표면보다 조금 크게, 조금 더 빠르게 돌려 깊이를 만든다.
function cloudRowRenderer(): (y: number, data: Uint8Array) => void {
  return (y: number, data: Uint8Array) => {
    const v = y / (CLOUD_HEIGHT - 1);
    const sinTheta = Math.sin(v * Math.PI);
    const latitude = Math.cos(v * Math.PI);

    for (let x = 0; x < CLOUD_WIDTH; x += 1) {
      const phi = (x / CLOUD_WIDTH) * Math.PI * 2;
      const nx = sinTheta * Math.cos(phi);
      const nz = sinTheta * Math.sin(phi);
      const density = fbm(nx * 3.6, latitude * 3.6, nz * 3.6, 20260816, 4);
      // 문턱을 넘은 부분만 구름 — 안 그러면 행성 전체가 뿌옇게 덮인다.
      const alpha = Math.max(0, (density - 0.52) / 0.48) ** 1.15;
      const index = (y * CLOUD_WIDTH + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(Math.min(1, alpha) * 235);
    }
  };
}

function cloudJobFor(): SlicedTextureJob {
  if (cloudJob) {
    return cloudJob;
  }

  cloudJob = createSlicedTextureJob({
    width: CLOUD_WIDTH,
    height: CLOUD_HEIGHT,
    renderRow: cloudRowRenderer(),
    finalize: (texture) => {
      finalizeSphericalTexture(texture);
      cloudTexture = texture;
      cloudJob = null;
    },
  });
  return cloudJob;
}

export function getCloudTexture(): DataTexture {
  if (cloudTexture) {
    return cloudTexture;
  }

  cloudJobFor().step(Number.POSITIVE_INFINITY);
  return cloudTexture as unknown as DataTexture;
}

let ringTexture: DataTexture | null = null;

// 고리 — 반지름 방향으로만 변하는 띠. ringGeometry의 uv.x가 반지름을 따라가므로 가로 한 줄이면 된다.
export function getRingTexture(): DataTexture {
  if (ringTexture) {
    return ringTexture;
  }

  const width = 256;
  const data = new Uint8Array(width * 4);

  for (let x = 0; x < width; x += 1) {
    const t = x / (width - 1);
    // 굵은 띠 몇 개 + 잔결. 카시니 간극처럼 완전히 빈 구간도 남긴다.
    const coarse = Math.sin(t * 9.5) * 0.5 + 0.5;
    const fine = Math.sin(t * 47) * 0.5 + 0.5;
    const gap = t > 0.52 && t < 0.58 ? 0 : 1;
    const edge = Math.min(1, Math.min(t, 1 - t) / 0.06);
    const alpha = gap * edge * (0.28 + coarse * 0.5 + fine * 0.22) * 0.9;
    const index = x * 4;

    data[index] = 236;
    data[index + 1] = 226;
    data[index + 2] = 206;
    data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  }

  ringTexture = new DataTexture(data, width, 1, RGBAFormat, UnsignedByteType);
  ringTexture.wrapS = ClampToEdgeWrapping;
  ringTexture.wrapT = ClampToEdgeWrapping;
  ringTexture.magFilter = LinearFilter;
  ringTexture.minFilter = LinearFilter;
  ringTexture.needsUpdate = true;
  return ringTexture;
}

let starSurface: DataTexture | null = null;
let starJob: SlicedTextureJob | null = null;

// 항성 표면 — 대류 알갱이(granulation)와 흑점. 색은 재질 쪽에서 온도별로 곱한다.
function starRowRenderer(): (y: number, data: Uint8Array) => void {
  return (y: number, data: Uint8Array) => {
    const v = y / (SURFACE_HEIGHT - 1);
    const sinTheta = Math.sin(v * Math.PI);
    const latitude = Math.cos(v * Math.PI);

    for (let x = 0; x < SURFACE_WIDTH; x += 1) {
      const phi = (x / SURFACE_WIDTH) * Math.PI * 2;
      const nx = sinTheta * Math.cos(phi);
      const nz = sinTheta * Math.sin(phi);
      const granule = fbm(nx * 9, latitude * 9, nz * 9, 815815, 4);
      const spot = fbm(nx * 2.6, latitude * 2.6, nz * 2.6, 90210, 3);
      // 알갱이는 밝기를 흔들고, 흑점은 크게 어둡게 누른다.
      let level = 0.72 + granule * 0.28;

      if (spot < 0.36) {
        level *= 0.42 + (spot / 0.36) * 0.5;
      }

      const value = Math.round(Math.max(0, Math.min(1, level)) * 255);
      const index = (y * SURFACE_WIDTH + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  };
}

function starJobFor(): SlicedTextureJob {
  if (starJob) {
    return starJob;
  }

  starJob = createSlicedTextureJob({
    width: SURFACE_WIDTH,
    height: SURFACE_HEIGHT,
    renderRow: starRowRenderer(),
    finalize: (texture) => {
      finalizeSphericalTexture(texture);
      starSurface = texture;
      starJob = null;
    },
  });
  return starJob;
}

export function getStarSurface(): DataTexture {
  if (starSurface) {
    return starSurface;
  }

  starJobFor().step(Number.POSITIVE_INFINITY);
  return starSurface as unknown as DataTexture;
}

// 구울 수 있는 모든 원형의 목록 — 프리워밍(CelestialSphere)이 쓴다. 첫 확대에서 필요한
// 순간에 구우면 250-600ms 멈칫의 행렬이 되므로, 탭이 자리잡은 뒤 한 장씩 미리 굽는다.
// 전부 모듈 캐시에 남으니 언제 구워도 순수 이득이다.
import {
  getBlackbodyRamp,
  getDeepGalaxyTexture,
  getDustLaneTexture,
  getGlowTexture,
  getNebulaTexture,
  getSpikedStarTexture,
  getStarPointTexture,
} from '@/features/universe/three/textures';

// 첫 화면(지역 층)이 실제로 쓰는 것들 — 작고 빠르다. 진입 로딩은 **이것만** 기다린다.
export function listSkyTextureBakes(): (() => unknown)[] {
  return [
    () => getGlowTexture(),
    () => getStarPointTexture(),
    () => getSpikedStarTexture(),
    () => getBlackbodyRamp(),
    () => getDustLaneTexture(),
    () => getNebulaTexture(0),
    () => getNebulaTexture(1),
    // 깊은 은하 스프라이트 3장(64×64 DataTexture, 장당 한 자릿수 ms) — 마운트 렌더가
    // 동기로 굽던 걸 목록에 넣어 마운트를 베이크 없는 렌더로 만든다(위생).
    () => getDeepGalaxyTexture(0),
    () => getDeepGalaxyTexture(1),
    () => getDeepGalaxyTexture(2),
  ];
}

// ── 공용 베이크 펌프 (2026-08-26 '로딩 중 조작' 사고) ──────────────────────────────
// 진입 로딩 홀드와 잔여 드레인이 **같은 큐를 같은 커서로** 굽는다 — 목록을 각자 들면
// 이중 작업은 캐시가 막아줘도 순서·진행률이 갈라진다. 순서가 계약이다: ① 첫 화면이 쓰는
// 하늘 텍스처가 맨 앞(상한이 잘라도 첫 화면은 항상 완성), ② 그 뒤는 싼 것부터 무거운 것
// 순(잘려도 제일 무거운 놈들만 남게) — 고리·구름·마스크·항성·표면. 무거운 항목은 행 단위
// 재개형이라 마감(deadline)을 넘기는 순간 그 자리에서 멈추고 다음 호출이 이어 굽는다.
type BakeQueueEntry = {
  isDone: () => boolean;
  advance: (deadlineMs: number) => void;
};

function monolithicEntry(run: () => unknown): BakeQueueEntry {
  let done = false;

  return {
    isDone: () => done,
    advance: () => {
      run();
      done = true;
    },
  };
}

let bakeQueue: BakeQueueEntry[] | null = null;
let bakeCursor = 0;

function ensureBakeQueue(): BakeQueueEntry[] {
  if (bakeQueue) {
    return bakeQueue;
  }

  const queue: BakeQueueEntry[] = [];

  // 하늘 텍스처들 — 전부 작아서(64-256px, fbm 없음 또는 얕음) 통째로 굽는다.
  listSkyTextureBakes().forEach((bake) => queue.push(monolithicEntry(bake)));
  queue.push(monolithicEntry(() => getRingTexture()));

  // 무거운 것들 — 행 단위 재개형.
  queue.push({ isDone: () => cloudTexture !== null, advance: (d) => cloudJobFor().step(d) });

  for (let variant = 0; variant < VARIANTS.terrestrial; variant += 1) {
    queue.push({ isDone: () => maskCache.has(variant), advance: (d) => maskJobFor(variant).step(d) });
  }

  queue.push({ isDone: () => starSurface !== null, advance: (d) => starJobFor().step(d) });

  (Object.keys(VARIANTS) as PlanetKind[]).forEach((kind) => {
    for (let variant = 0; variant < VARIANTS[kind]; variant += 1) {
      queue.push({
        isDone: () => surfaceCache.has(`${kind}:${variant}`),
        advance: (d) => surfaceJobFor(kind, variant).step(d),
      });
    }
  });

  bakeQueue = queue;
  return queue;
}

// 마감까지 큐를 전진시키고 남은 항목 수를 돌려준다. 재진입 안전(모두 캐시 채우기).
export function stepTextureBakes(deadlineMs: number): number {
  const queue = ensureBakeQueue();

  while (bakeCursor < queue.length) {
    const entry = queue[bakeCursor];

    if (entry.isDone()) {
      bakeCursor += 1;
      continue;
    }

    entry.advance(deadlineMs);

    if (entry.isDone()) {
      bakeCursor += 1;
    }

    if (Date.now() >= deadlineMs) {
      break;
    }
  }

  return pendingTextureBakeCount();
}

export function pendingTextureBakeCount(): number {
  const queue = ensureBakeQueue();
  let remaining = 0;

  for (let index = bakeCursor; index < queue.length; index += 1) {
    if (!queue[index].isDone()) {
      remaining += 1;
    }
  }

  return remaining;
}

// 테스트 전용 — 캐시·작업·큐를 전부 초기화해 콜드 스타트를 재현한다.
export function resetPlanetTexturesForTest() {
  surfaceCache.clear();
  maskCache.clear();
  surfaceJobs.clear();
  maskJobs.clear();
  cloudTexture = null;
  cloudJob = null;
  starSurface = null;
  starJob = null;
  ringTexture = null;
  bakeQueue = null;
  bakeCursor = 0;
}
