import { StyleSheet, Text, View } from 'react-native';
import { RunMapRegion } from './tracking';
import { colors } from '@/theme/tokens';

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
    backgroundColor: colors.borderMuted,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
