import { memo, useMemo } from 'react';
import NativeMapView, {
  Marker as NativeMarker,
  Polyline as NativePolyline,
} from 'react-native-maps';
import { StyleSheet } from 'react-native';
import type { RunMapRegion } from './tracking';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

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
      ? <NativePolyline coordinates={plannedRouteCoordinates} strokeColor="#CBD5E1" strokeWidth={4} lineDashPattern={PLANNED_ROUTE_DASH_PATTERN} />
      : null
  ), [plannedRouteCoordinates]);
  const actualRoute = useMemo(() => (
    actualRouteCoordinates.length > 1
      ? <NativePolyline coordinates={actualRouteCoordinates} strokeColor="#6D5EF7" strokeWidth={5} />
      : null
  ), [actualRouteCoordinates]);
  const latestMarker = useMemo(() => (
    markerCoordinate ? <NativeMarker coordinate={markerCoordinate} /> : null
  ), [markerCoordinate]);

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
      {latestMarker}
    </NativeMapView>
  );
}, areRunRouteMapPropsEqual);

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
