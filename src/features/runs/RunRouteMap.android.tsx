// Android용 — Google Maps 키가 박힌 바이너리(versionCode 41+)에서는 iOS와 같은 실제
// 지도를 그리고, 키 없는 옛 빌드(38~40)에서는 기존 상태 카드로 폴백한다 (키 없이
// MapView를 그리면 빈 회색 타일만 나온다).

import { isAndroidMapsReady } from '@/integrations/androidMapsAvailability';
import type { RunMapRegion } from './tracking';
import { RunRouteMap as NativeRunRouteMap } from './RunRouteMap.native';
import { RunRouteMapPlaceholder } from './RunRouteMapPlaceholder';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type RunRouteMapProps = {
  actualCoordinates?: Coordinate[];
  plannedCoordinates?: Coordinate[];
  latestCoordinate?: Coordinate | null;
  initialRegion?: RunMapRegion | null;
  live?: boolean;
  emptyTitle?: string;
  emptyText?: string;
};

export function RunRouteMap({
  emptyTitle = '저장된 러닝 경로를 불러오는 중이에요.',
  emptyText = '이 기록에는 지도 경로가 함께 저장돼 있어요.',
  ...mapProps
}: RunRouteMapProps) {
  if (isAndroidMapsReady()) {
    return <NativeRunRouteMap {...mapProps} />;
  }

  return <RunRouteMapPlaceholder emptyTitle={emptyTitle} emptyText={emptyText} />;
}
