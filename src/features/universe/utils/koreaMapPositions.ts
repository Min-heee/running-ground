// 은하를 실제 지도 자리에 (오너 2026-08-16: "각 은하를 우리나라 지도 지역 위치처럼").
//
// 시/도는 궤도에 늘어놓지 않고 실제 위도·경도가 있는 자리에 앉힌다. 서울이 위쪽에, 부산이
// 오른쪽 아래에, 제주가 저 아래 홀로 떨어져 있는 배치는 한 번 보면 바로 읽힌다 — 어느
// 은하가 우리 동네인지 찾는 데 이름을 읽을 필요가 없어진다.
//
// 좌표는 각 시·도청 소재지의 대략적인 위경도다. 정밀한 경계가 필요한 게 아니라 '어디쯤'만
// 맞으면 된다. 이름을 못 찾으면 호출자가 기존 궤도 배치로 되돌아간다 — 행정구역 통합이나
// 개명이 있어도 화면이 비지 않게.

type LatLon = { lat: number; lon: number };

const REGION_LATLON: Record<string, LatLon> = {
  서울특별시: { lat: 37.57, lon: 126.98 },
  인천광역시: { lat: 37.46, lon: 126.71 },
  경기도: { lat: 37.29, lon: 127.35 },
  강원특별자치도: { lat: 37.75, lon: 128.32 },
  강원도: { lat: 37.75, lon: 128.32 },
  충청북도: { lat: 36.79, lon: 127.86 },
  충청남도: { lat: 36.52, lon: 126.75 },
  세종특별자치시: { lat: 36.48, lon: 127.29 },
  대전광역시: { lat: 36.35, lon: 127.38 },
  전북특별자치도: { lat: 35.75, lon: 127.1 },
  전라북도: { lat: 35.75, lon: 127.1 },
  전라남도: { lat: 34.9, lon: 126.9 },
  광주광역시: { lat: 35.16, lon: 126.85 },
  전남광주통합특별시: { lat: 35.05, lon: 126.88 },
  경상북도: { lat: 36.35, lon: 128.75 },
  대구광역시: { lat: 35.87, lon: 128.6 },
  경상남도: { lat: 35.4, lon: 128.25 },
  부산광역시: { lat: 35.18, lon: 129.08 },
  울산광역시: { lat: 35.54, lon: 129.31 },
  제주특별자치도: { lat: 33.5, lon: 126.53 },
};

// 한반도 남부의 대략적인 범위 — 이 안에서 정규화한다.
const LAT_MIN = 33.2;
const LAT_MAX = 38.3;
const LON_MIN = 125.9;
const LON_MAX = 129.6;

export type MapPoint = { x: number; y: number };

// 지도 좌표를 -1..1 정사각형 안으로. 위경도를 각각 늘이면 나라가 찌그러지므로 **한 배율**로
// 줄이고, 남는 쪽에 여백을 둔다.
export function mapPointFor(name: string): MapPoint | null {
  const entry = REGION_LATLON[name.trim()];

  if (!entry) {
    return null;
  }

  const lonSpan = LON_MAX - LON_MIN;
  const latSpan = LAT_MAX - LAT_MIN;
  // 위도 1도가 경도 1도보다 길다(우리 위도에서 경도 1도 ≈ 0.8도). 그 비를 반영해야
  // 남북으로 긴 반도 모양이 나온다.
  const lonScale = 0.8;
  const span = Math.max(lonSpan * lonScale, latSpan);

  return {
    x: (((entry.lon - LON_MIN) / lonSpan - 0.5) * lonSpan * lonScale * 2) / span,
    // 화면 y는 아래로 증가하므로 위도는 부호를 뒤집는다.
    y: (-((entry.lat - LAT_MIN) / latSpan - 0.5) * latSpan * 2) / span,
  };
}

export function hasMapPoint(name: string): boolean {
  return Boolean(REGION_LATLON[name.trim()]);
}
