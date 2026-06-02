import type { RunMapRegion } from './tracking';
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
}: RunRouteMapProps) {
  return <RunRouteMapPlaceholder emptyTitle={emptyTitle} emptyText={emptyText} />;
}
