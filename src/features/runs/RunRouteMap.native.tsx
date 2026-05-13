import { memo, useMemo } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet } from 'react-native';
import { RunMapRegion } from './tracking';

type Coordinate = {
  latitude: number;
  longitude: number;
};

const PLANNED_ROUTE_DASH_PATTERN = [8, 6];
const EMPTY_COORDINATES: Coordinate[] = [];

export const RunRouteMap = memo(function RunRouteMap({
  actualCoordinates = EMPTY_COORDINATES,
  plannedCoordinates = EMPTY_COORDINATES,
  latestCoordinate,
  initialRegion,
  live = false,
}: {
  actualCoordinates?: Coordinate[];
  plannedCoordinates?: Coordinate[];
  latestCoordinate?: Coordinate | null;
  initialRegion?: RunMapRegion | null;
  live?: boolean;
}) {
  const shouldFollowUserLocation = live && plannedCoordinates.length === 0;
  const plannedRoute = useMemo(() => (
    plannedCoordinates.length > 1
      ? <Polyline coordinates={plannedCoordinates} strokeColor="#CBD5E1" strokeWidth={4} lineDashPattern={PLANNED_ROUTE_DASH_PATTERN} />
      : null
  ), [plannedCoordinates]);
  const actualRoute = useMemo(() => (
    actualCoordinates.length > 1
      ? <Polyline coordinates={actualCoordinates} strokeColor="#6D5EF7" strokeWidth={5} />
      : null
  ), [actualCoordinates]);
  const latestMarker = useMemo(() => (
    latestCoordinate ? <Marker coordinate={latestCoordinate} /> : null
  ), [latestCoordinate]);

  if (!initialRegion) {
    return null;
  }

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
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
    </MapView>
  );
});
