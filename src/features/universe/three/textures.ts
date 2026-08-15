import { DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping } from 'three';

// 절차적 텍스처 — 캔버스 API 없이 픽셀 배열을 직접 만든다. RN에는 DOM canvas가 없으므로
// (웹에서만 되는) CanvasTexture를 쓰면 네이티브에서 통째로 깨진다. DataTexture는 양쪽 동일.

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
let nebulaTexture: DataTexture | null = null;
let starTexture: DataTexture | null = null;

// 천체 후광 — 중심이 강하고 급격히 떨어진다(가까이서 봐도 뭉개지지 않게).
export function getGlowTexture(): DataTexture {
  if (!glowTexture) {
    glowTexture = buildRadialTexture(128, (t) => (1 - t) ** 3.2);
  }

  return glowTexture;
}

// 성운 구름 — 넓고 흐리게 퍼진다. 여러 장을 다른 크기·회전으로 겹쳐 덩어리를 만든다.
export function getNebulaTexture(): DataTexture {
  if (!nebulaTexture) {
    nebulaTexture = buildRadialTexture(128, (t) => (1 - t) ** 2 * 0.55);
  }

  return nebulaTexture;
}

// 배경 별 한 점 — 중심만 또렷하고 가장자리는 거의 투명(점이 사각형으로 보이지 않게).
export function getStarPointTexture(): DataTexture {
  if (!starTexture) {
    starTexture = buildRadialTexture(64, (t) => (1 - t) ** 4);
  }

  return starTexture;
}
