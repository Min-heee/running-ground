import { DataTexture, PlaneGeometry, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping } from 'three';

// 절차적 텍스처 — 캔버스 API 없이 픽셀 배열을 직접 만든다. RN에는 DOM canvas가 없으므로
// (웹에서만 되는) CanvasTexture를 쓰면 네이티브에서 통째로 깨진다. DataTexture는 양쪽 동일.

// 방사형 감쇠 판의 공용 지오메트리 — 바깥 20%를 잘라낸 단위 판. 글로우·코로나·스파이크·
// 스트리머의 감쇠는 반지름 0.8 밖에서 픽셀당 1/255도 못 쓰는데, 그 띠가 판 면적의 36%다.
// UV를 [0.1, 0.9]로 좁혀 **같은 그림**을 20% 작은 판으로 그린다(텍스처 샘플링과 vUv 기반
// 셰이더 양쪽에 유효) — 판을 그냥 줄이면 감쇠 곡선까지 압축돼 그림이 바뀐다. 쓰는 쪽은
// 예전 판 크기에 0.8을 곱해 이 지오메트리를 쓴다. 공용이라 영원히 산다(dispose 금지).
let trimmedUnitPlane: PlaneGeometry | null = null;

export function getTrimmedUnitPlane(): PlaneGeometry {
  if (!trimmedUnitPlane) {
    trimmedUnitPlane = new PlaneGeometry(1, 1);
    const uvs = trimmedUnitPlane.attributes.uv;

    for (let index = 0; index < uvs.count; index += 1) {
      uvs.setXY(index, 0.1 + uvs.getX(index) * 0.8, 0.1 + uvs.getY(index) * 0.8);
    }
  }

  return trimmedUnitPlane;
}

function buildRadialTexture(size: number, falloff: (t: number) => number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = distance >= 1 ? 0 : Math.max(0, Math.min(1, falloff(distance)));
      const index = (y * size + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

let glowTexture: DataTexture | null = null;
const nebulaTextures = new Map<number, DataTexture>();
let starTexture: DataTexture | null = null;
let blackbodyRamp: DataTexture | null = null;
let spikedStarTexture: DataTexture | null = null;

// 천체 후광 — 중심이 강하고 급격히 떨어진다(가까이서 봐도 뭉개지지 않게).
export function getGlowTexture(): DataTexture {
  if (!glowTexture) {
    glowTexture = buildRadialTexture(128, (t) => (1 - t) ** 3.2);
  }

  return glowTexture;
}

// 성운 구름 — 넓고 흐리게 퍼진다. 여러 장을 다른 크기·회전으로 겹쳐 덩어리를 만든다.
//
// 감쇠가 완만하면 판 한 장이 화면 전체를 고르게 덮는다. 그런 판을 가산합성으로 여러 장
// 겹치면 검은 하늘이 통째로 보랏빛으로 들려 올라간다 (오너 2026-08-17: "너무 밝아, 우주는
// 어두운 맛이 있어야지"). 가파르게 떨어뜨려 **중심에만** 남기면, 같은 장수로도 하늘은 검고
// 구름은 구름으로 보인다.
//
// 2026-08-19: 안개 원반 → 필라멘트. 같은 방사형 봉투 아래에 좌표를 뒤튼(domain warp) 잡음을
// 깔고 문턱을 걸어, 내부의 절반쯤은 알파가 **문자 그대로 0**이다 — 빛이 실오라기로 모이고
// 총 발광량은 오히려 준다. 진짜 성운은 구름이 아니라 실타래다.
export function getNebulaTexture(variant: 0 | 1 = 0): DataTexture {
  const cached = nebulaTextures.get(variant);

  if (cached) {
    return cached;
  }

  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const seed = 926 + variant * 401;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      let alpha = 0;

      if (distance < 1) {
        const envelope = (1 - distance) ** 3.4 * 0.34;
        // 좌표 뒤틀기 — 잡음으로 잡음의 자리를 민다. 이게 '구름 낀 원'과 '실타래'를 가른다.
        const warp = valueNoise2(dx * 2.3 + 11.7, dy * 2.3 - 5.1, seed);
        const flow = valueNoise2(
          dx * 3.1 + (warp - 0.5) * 2.5,
          dy * 3.1 + (warp - 0.5) * 2.5 + 31.4,
          seed + 97,
        ) * 0.65 + valueNoise2(dx * 7.4, dy * 7.4, seed + 193) * 0.35;
        // 문턱 아래는 0 — 내부의 절반이 진짜로 빈다.
        alpha = envelope * Math.max(0, (flow - 0.42) / 0.58) ** 1.9 * 2.2;
      }

      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  nebulaTextures.set(variant, texture);
  return texture;
}

// 흑체 복사 램프 — 별의 색은 팔레트가 아니라 온도다. 2600K의 주홍부터 11000K의 청백까지,
// 플랑크 궤적을 눈에 보이는 만큼만 흉내 낸다. 셰이더가 warmth(0~1)로 이 띠를 읽는다.
const BLACKBODY_STOPS: [number, number, number][] = [
  [255, 156, 90], // ~2600K
  [255, 196, 138], // ~3800K
  [255, 232, 196], // ~5200K
  [255, 255, 255], // ~6500K
  [220, 232, 255], // ~8000K
  [180, 203, 255], // ~11000K
];

export function getBlackbodyRamp(): DataTexture {
  if (blackbodyRamp) {
    return blackbodyRamp;
  }

  const width = 64;
  const data = new Uint8Array(width * 4);

  for (let x = 0; x < width; x += 1) {
    const t = (x / (width - 1)) * (BLACKBODY_STOPS.length - 1);
    const low = Math.min(BLACKBODY_STOPS.length - 2, Math.floor(t));
    const mix = t - low;
    const a = BLACKBODY_STOPS[low];
    const b = BLACKBODY_STOPS[low + 1];
    const index = x * 4;

    data[index] = Math.round(a[0] + (b[0] - a[0]) * mix);
    data[index + 1] = Math.round(a[1] + (b[1] - a[1]) * mix);
    data[index + 2] = Math.round(a[2] + (b[2] - a[2]) * mix);
    data[index + 3] = 255;
  }

  blackbodyRamp = new DataTexture(data, width, 1, RGBAFormat, UnsignedByteType);
  blackbodyRamp.magFilter = LinearFilter;
  blackbodyRamp.minFilter = LinearFilter;
  blackbodyRamp.wrapS = ClampToEdgeWrapping;
  blackbodyRamp.wrapT = ClampToEdgeWrapping;
  blackbodyRamp.needsUpdate = true;
  return blackbodyRamp;
}

const deepGalaxyTextures = new Map<number, DataTexture>();

// 아득히 먼 은하 한 점 — 해상되지 않는 기울어진 타원 얼룩. 딥 필드(허블이 '빈' 하늘을
// 오래 노출하자 은하 수천 개가 나온 그 사진)의 최소 단위다. 이게 배경에 흩어져 있어야
// '별 몇 개 찍힌 검은 판'이 아니라 '끝없이 계속되는 우주'로 읽힌다.
//
// 변종마다 장축 각도와 납작함을 텍스처에 굽는다 — 포인트 스프라이트는 회전을 못 하므로,
// 방향 다양성은 변종 여러 장으로 낸다.
export function getDeepGalaxyTexture(variant: 0 | 1 | 2): DataTexture {
  const cached = deepGalaxyTextures.get(variant);

  if (cached) {
    return cached;
  }

  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const angle = [0.5, 1.9, -0.9][variant];
  const flatten = [0.42, 0.62, 0.3][variant];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      // 장축 좌표계로 돌려 타원 가우시안.
      const major = dx * cos + dy * sin;
      const minor = (-dx * sin + dy * cos) / flatten;
      const r2 = major * major + minor * minor;
      // 작고 밝은 핵 + 옅은 원반 — 두 겹이어야 '별'이 아니라 '은하'로 읽힌다.
      const alpha = Math.exp(-r2 * 3.2) * 0.55 + Math.exp(-r2 * 14) * 0.45;
      const index = (y * size + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  deepGalaxyTextures.set(variant, texture);
  return texture;
}

// 회절 스파이크 별 — 망원경 광학이 남기는 십자 빛살. JWST 이후로 '진짜 관측 사진'의
// 문화적 기호가 됐다. 팔은 1~2px로 면도날처럼 가늘어야 한다 — 두꺼우면 십자 스티커다.
export function getSpikedStarTexture(): DataTexture {
  if (spikedStarTexture) {
    return spikedStarTexture;
  }

  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const r = Math.sqrt(dx * dx + dy * dy);
      const core = r >= 1 ? 0 : (1 - r) ** 3.5;
      const armH = Math.exp(-Math.abs(dy) * 46) * Math.max(0, 1 - Math.abs(dx)) ** 2.4;
      const armV = Math.exp(-Math.abs(dx) * 46) * Math.max(0, 1 - Math.abs(dy)) ** 2.4;
      const alpha = Math.min(1, core + 0.85 * (armH + armV));
      const index = (y * size + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  spikedStarTexture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  spikedStarTexture.magFilter = LinearFilter;
  spikedStarTexture.minFilter = LinearFilter;
  spikedStarTexture.wrapS = ClampToEdgeWrapping;
  spikedStarTexture.wrapT = ClampToEdgeWrapping;
  spikedStarTexture.needsUpdate = true;
  return spikedStarTexture;
}

// 배경 별 한 점 — 중심만 또렷하고 가장자리는 거의 투명(점이 사각형으로 보이지 않게).
export function getStarPointTexture(): DataTexture {
  if (!starTexture) {
    starTexture = buildRadialTexture(64, (t) => (1 - t) ** 4);
  }

  return starTexture;
}

// --- 나선 팔과 먼지 띠 ------------------------------------------------------------
//
// 나선의 수학은 **여기 한 곳**에 산다. 파티클 배치(GalaxyDisk)와 먼지 띠 텍스처가 같은
// 상수·같은 공식을 읽어야 띠가 팔 위에 앉는다 — 두 벌이면 반드시 어긋나 먼지가 허공을
// 가로지른다.
export const SPIRAL_BRANCHES = 3;
export const SPIRAL_SPIN = 2.6;
// 먼지는 팔의 안쪽(선행) 가장자리를 탄다 — 실제 나선은하에서 충격파가 지나가는 자리.
const DUST_LANE_OFFSET = 0.16;

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 1013904223;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothT(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothT(x - xi);
  const yf = smoothT(y - yi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return lerp(
    lerp(hash2(xi, yi, seed), hash2(xi + 1, yi, seed), xf),
    lerp(hash2(xi, yi + 1, seed), hash2(xi + 1, yi + 1, seed), xf),
    yf,
  );
}

function smoothstepLocal(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// 단위 원반 좌표(반지름 1)에서의 먼지 띠 세기(0~1). 배치와 텍스처가 함께 쓴다.
export function dustLaneStrength(x: number, y: number): number {
  const r = Math.hypot(x, y);

  if (r <= 0.02 || r > 1) {
    return 0;
  }

  const theta = Math.atan2(y, x);
  let strength = 0;

  for (let branch = 0; branch < SPIRAL_BRANCHES; branch += 1) {
    const armAngle = (branch / SPIRAL_BRANCHES) * Math.PI * 2 + r * SPIRAL_SPIN;
    // 각도 차를 [-π, π]로 감아 자오선 이음매를 없앤다.
    let delta = theta - (armAngle - DUST_LANE_OFFSET);
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    // 호 길이 기준 — 각도만 쓰면 중심 근처에서 띠가 부챗살처럼 벌어진다.
    const arc = Math.abs(delta) * r;
    strength += Math.exp(-((arc / 0.055) ** 2));
  }

  // 핵 안쪽과 원반 바깥에는 먼지가 없다 — 띠는 팔이 사는 반지름에만 산다.
  const window = smoothstepLocal(0.12, 0.2, r) * (1 - smoothstepLocal(0.55, 0.85, r));
  // 덩어리진 잡음 — 벡터로 그린 듯 매끈한 띠는 도표지 사진이 아니다.
  const clump = 0.45 + 0.55 * valueNoise2(x * 9 + 3.7, y * 9 - 1.2, 926);

  return Math.min(1, strength) * window * clump;
}

let dustLaneTexture: DataTexture | null = null;

// 먼지 띠 — **어둠으로 그리는** 유일한 텍스처. 가산이 아니라 일반 합성으로 뒤의 별빛을
// 삼킨다. 파티클 원반이 '빛나는 점 무더기'가 아니라 '사진 속 은하'로 읽히게 만드는
// 단서 1순위이고, 화면의 총 광량을 오히려 낮춘다.
export function getDustLaneTexture(): DataTexture {
  if (dustLaneTexture) {
    return dustLaneTexture;
  }

  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x - center) / center;
      const py = (y - center) / center;
      const alpha = dustLaneStrength(px, py) * 0.75;
      const index = (y * size + x) * 4;

      data[index] = 18;
      data[index + 1] = 10;
      data[index + 2] = 7;
      data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }

  dustLaneTexture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  dustLaneTexture.magFilter = LinearFilter;
  dustLaneTexture.minFilter = LinearFilter;
  dustLaneTexture.wrapS = ClampToEdgeWrapping;
  dustLaneTexture.wrapT = ClampToEdgeWrapping;
  dustLaneTexture.needsUpdate = true;
  return dustLaneTexture;
}
