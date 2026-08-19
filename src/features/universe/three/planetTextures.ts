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

function buildSurface(kind: PlanetKind, variant: number): DataTexture {
  const data = new Uint8Array(SURFACE_WIDTH * SURFACE_HEIGHT * 4);
  const seed = (kind.length * 7919 + variant * 104729) % 2147483647;

  for (let y = 0; y < SURFACE_HEIGHT; y += 1) {
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
  }

  const texture = new DataTexture(data, SURFACE_WIDTH, SURFACE_HEIGHT, RGBAFormat, UnsignedByteType);
  // 가로는 한 바퀴 돌아 이어지고, 세로(극)는 잘린다.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const surfaceCache = new Map<string, DataTexture>();
const maskCache = new Map<number, DataTexture>();

// 지구형 행성의 마스크 — R: 도시 불빛(육지·중위도·덩어리진), G: 바다.
//
// 표면 텍스처의 알파에 싣지 않고 **따로** 만든다: 해상 교차 페이드 중에는 재질이
// transparent가 되는데, 그때 지도의 알파가 255 미만이면 행성이 반투명해져 뒤가 비친다.
// 같은 시드·같은 고도 공식을 쓰므로 바다 마스크는 표면의 바다와 정확히 겹친다.
export function getPlanetMask(variant: number): DataTexture {
  const safeVariant = Math.abs(variant) % VARIANTS.terrestrial;
  const cached = maskCache.get(safeVariant);

  if (cached) {
    return cached;
  }

  const width = 256;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  const seed = ('terrestrial'.length * 7919 + safeVariant * 104729) % 2147483647;
  const seaLevel = 0.5;

  for (let y = 0; y < height; y += 1) {
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
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  maskCache.set(safeVariant, texture);
  return texture;
}

export function getPlanetSurface(kind: PlanetKind, variant: number): DataTexture {
  const safeVariant = Math.abs(variant) % VARIANTS[kind];
  const key = `${kind}:${safeVariant}`;
  const cached = surfaceCache.get(key);

  if (cached) {
    return cached;
  }

  const texture = buildSurface(kind, safeVariant);
  surfaceCache.set(key, texture);
  return texture;
}

let cloudTexture: DataTexture | null = null;

// 구름 — 알파만 있는 흰 층. 표면보다 조금 크게, 조금 더 빠르게 돌려 깊이를 만든다.
export function getCloudTexture(): DataTexture {
  if (cloudTexture) {
    return cloudTexture;
  }

  const data = new Uint8Array(CLOUD_WIDTH * CLOUD_HEIGHT * 4);

  for (let y = 0; y < CLOUD_HEIGHT; y += 1) {
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
  }

  cloudTexture = new DataTexture(data, CLOUD_WIDTH, CLOUD_HEIGHT, RGBAFormat, UnsignedByteType);
  cloudTexture.wrapS = RepeatWrapping;
  cloudTexture.wrapT = ClampToEdgeWrapping;
  cloudTexture.magFilter = LinearFilter;
  cloudTexture.minFilter = LinearFilter;
  cloudTexture.needsUpdate = true;
  return cloudTexture;
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

// 항성 표면 — 대류 알갱이(granulation)와 흑점. 색은 재질 쪽에서 온도별로 곱한다.
export function getStarSurface(): DataTexture {
  if (starSurface) {
    return starSurface;
  }

  const data = new Uint8Array(SURFACE_WIDTH * SURFACE_HEIGHT * 4);

  for (let y = 0; y < SURFACE_HEIGHT; y += 1) {
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
  }

  starSurface = new DataTexture(data, SURFACE_WIDTH, SURFACE_HEIGHT, RGBAFormat, UnsignedByteType);
  starSurface.wrapS = RepeatWrapping;
  starSurface.wrapT = ClampToEdgeWrapping;
  starSurface.magFilter = LinearFilter;
  starSurface.minFilter = LinearFilter;
  starSurface.needsUpdate = true;
  return starSurface;
}
