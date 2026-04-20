import { StyleSheet, Text, View } from 'react-native';
import { RunMapRegion } from './tracking';

type Coordinate = {
  latitude: number;
  longitude: number;
};

export function RunRouteMap({
  emptyTitle,
  emptyText,
}: {
  actualCoordinates?: Coordinate[];
  plannedCoordinates?: Coordinate[];
  latestCoordinate?: Coordinate | null;
  initialRegion?: RunMapRegion | null;
  live?: boolean;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptyText}>{emptyText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: '#E5E7EB',
  },
  emptyTitle: {
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: '#667085',
    textAlign: 'center',
    lineHeight: 20,
  },
});
