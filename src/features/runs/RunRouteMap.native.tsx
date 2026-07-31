import { memo, useMemo } from 'react';
import NativeMapView, {
  Marker as NativeMarker,
  Polyline as NativePolyline,
} from 'react-native-maps';
import { StyleSheet, View } from 'react-native';
import type { RunMapRegion } from './tracking';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';
import { colors, fixedColors } from '@/theme/tokens';

type Coordinate = {
  latitude: number;
  longitude: number;
};

const PLANNED_ROUTE_DASH_PATTERN = [8, 6];
const EMPTY_COORDINATES: Coordinate[] = [];

type RunRouteMapProps = {
  actualCoordinates?: Coordinate[];
  plannedCoordinates?: Coordinate[];
  latestCoordinate?: Coordinate | null;
  initialRegion?: RunMapRegion | null;
  live?: boolean;
};

export const RunRouteMap = memo(function RunRouteMap({
  actualCoordinates = EMPTY_COORDINATES,
  plannedCoordinates = EMPTY_COORDINATES,
  latestCoordinate,
  initialRegion,
  live = false,
}: RunRouteMapProps) {
  useDevRenderCounter(`RunRouteMap.native:${live ? 'live' : 'static'}`);
  const actualRouteCoordinates = useMemo(() => actualCoordinates, [actualCoordinates]);
  const plannedRouteCoordinates = useMemo(() => plannedCoordinates, [plannedCoordinates]);
  const markerCoordinate = useMemo(() => latestCoordinate ?? null, [latestCoordinate]);
  const mapInitialRegion = useMemo(() => initialRegion ?? null, [initialRegion]);
  const shouldFollowUserLocation = useMemo(
    () => live && plannedRouteCoordinates.length === 0,
    [live, plannedRouteCoordinates.length],
  );
  const plannedRoute = useMemo(() => (
    plannedRouteCoordinates.length > 1
      ? <NativePolyline coordinates={plannedRouteCoordinates} strokeColor={colors.borderCool} strokeWidth={4} lineDashPattern={PLANNED_ROUTE_DASH_PATTERN} />
      : null
  ), [plannedRouteCoordinates]);
  const actualRoute = useMemo(() => (
    actualRouteCoordinates.length > 1
      ? <NativePolyline coordinates={actualRouteCoordinates} strokeColor={colors.brand} strokeWidth={4} />
      : null
  ), [actualRouteCoordinates]);
  // 저장된 기록(정적) 뷰는 출발/도착 점으로 경로의 방향을 보여준다 (오너 2026-08-01,
  // 나이키식). 이때 기본 핀은 도착 점과 겹치므로 숨긴다. 라이브 뷰는 기존 그대로.
  const showRouteEndpoints = !live && actualRouteCoordinates.length > 1;
  const routeEndpoints = useMemo(() => {
    if (!showRouteEndpoints) {
      return null;
    }

    const startCoordinate = actualRouteCoordinates[0];
    const endCoordinate = actualRouteCoordinates[actualRouteCoordinates.length - 1];

    return (
      <>
        <NativeMarker coordinate={startCoordinate} anchor={CENTER_ANCHOR} tracksViewChanges={false}>
          <View style={[styles.routeDot, styles.routeDotStart]} />
        </NativeMarker>
        <NativeMarker coordinate={endCoordinate} anchor={CENTER_ANCHOR} tracksViewChanges={false}>
          <View style={[styles.routeDot, styles.routeDotEnd]} />
        </NativeMarker>
      </>
    );
  }, [actualRouteCoordinates, showRouteEndpoints]);
  const latestMarker = useMemo(() => (
    markerCoordinate && !showRouteEndpoints ? <NativeMarker coordinate={markerCoordinate} /> : null
  ), [markerCoordinate, showRouteEndpoints]);

  if (!mapInitialRegion) {
    return null;
  }

  return (
    <NativeMapView
      style={StyleSheet.absoluteFill}
      initialRegion={mapInitialRegion}
      showsUserLocation={live}
      followsUserLocation={shouldFollowUserLocation}
      scrollEnabled
      zoomEnabled
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {plannedRoute}
      {actualRoute}
      {routeEndpoints}
      {latestMarker}
    </NativeMapView>
  );
}, areRunRouteMapPropsEqual);

const CENTER_ANCHOR = { x: 0.5, y: 0.5 };

const styles = StyleSheet.create({
  routeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: fixedColors.white,
  },
  // 지도 타일은 항상 라이트라 테마 반응 토큰(다크에서 민트/살몬으로 밝아짐)을 쓰면
  // 다크 모드에서 씻겨 보인다 — 고정 팔레트로 (적대 리뷰 발견).
  routeDotStart: {
    backgroundColor: fixedColors.successStrong,
  },
  routeDotEnd: {
    backgroundColor: fixedColors.danger,
  },
});

function areRunRouteMapPropsEqual(prevProps: RunRouteMapProps, nextProps: RunRouteMapProps) {
  return prevProps.live === nextProps.live
    && areCoordinateArraysEqual(prevProps.actualCoordinates, nextProps.actualCoordinates)
    && areCoordinateArraysEqual(prevProps.plannedCoordinates, nextProps.plannedCoordinates)
    && areCoordinatesEqual(prevProps.latestCoordinate, nextProps.latestCoordinate)
    && areRegionsEqual(prevProps.initialRegion, nextProps.initialRegion);
}

function areCoordinateArraysEqual(left = EMPTY_COORDINATES, right = EMPTY_COORDINATES) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((coordinate, index) => areCoordinatesEqual(coordinate, right[index]));
}

function areCoordinatesEqual(left?: Coordinate | null, right?: Coordinate | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function areRegionsEqual(left?: RunMapRegion | null, right?: RunMapRegion | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.latitude === right.latitude
    && left.longitude === right.longitude
    && left.latitudeDelta === right.latitudeDelta
    && left.longitudeDelta === right.longitudeDelta;
}
