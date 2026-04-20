import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet } from 'react-native';
import { RunMapRegion } from './tracking';

type Coordinate = {
  latitude: number;
  longitude: number;
};

export function RunRouteMap({
  actualCoordinates = [],
  plannedCoordinates = [],
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
  if (!initialRegion) {
    return null;
  }

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      showsUserLocation={live}
      followsUserLocation={live && plannedCoordinates.length === 0}
      scrollEnabled
      zoomEnabled
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {plannedCoordinates.length > 1 ? (
        <Polyline coordinates={plannedCoordinates} strokeColor="#CBD5E1" strokeWidth={4} lineDashPattern={[8, 6]} />
      ) : null}
      {actualCoordinates.length > 1 ? (
        <Polyline coordinates={actualCoordinates} strokeColor="#6D5EF7" strokeWidth={5} />
      ) : null}
      {latestCoordinate ? <Marker coordinate={latestCoordinate} /> : null}
    </MapView>
  );
}
