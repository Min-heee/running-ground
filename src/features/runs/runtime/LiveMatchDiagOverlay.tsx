import { Platform, StyleSheet, Text, View } from 'react-native';
import { useLiveMatchDiag } from '@/features/runs/runtime/liveMatchDiagStore';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY ON-SCREEN DIAGNOSTIC OVERLAY — observe-only. Pinned at the top of the
// screen above EVERYTHING (countdown overlay AND measuring arena) so a physical
// device shows the real runtime snapshot + the events that opened the arena /
// started measuring. pointerEvents:'none' so it never intercepts touches. No
// interactivity. Revert before any real ship.
// ─────────────────────────────────────────────────────────────────────────────

function formatScalar(value: string | number | boolean | null | undefined): string {
  if (value == null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'y' : 'n';
  }
  return String(value);
}

function formatClock(tMs: number): string {
  const date = new Date(tMs);
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function LiveMatchDiagOverlay() {
  const { snapshot, events } = useLiveMatchDiag();
  const snapshotEntries = Object.entries(snapshot);
  const visibleEvents = events.slice(0, 10);

  return (
    <View style={styles.root} pointerEvents="none">
      <Text style={styles.heading}>LIVE-MATCH DIAG</Text>
      <View style={styles.snapshotBlock}>
        {snapshotEntries.map(([key, value]) => (
          <Text key={key} style={styles.line}>
            {`${key}=${formatScalar(value)}`}
          </Text>
        ))}
      </View>
      <View style={styles.divider} />
      <View style={styles.eventsBlock}>
        {visibleEvents.length === 0 ? (
          <Text style={styles.line}>(no events yet)</Text>
        ) : (
          visibleEvents.map((event, index) => (
            <Text key={`${event.tMs}-${index}`} style={styles.eventLine}>
              {`${formatClock(event.tMs)} ${event.label} ${event.detail}`}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 40,
    left: 4,
    right: 4,
    maxHeight: '55%',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 99999,
  },
  heading: {
    color: '#7CFC00',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  snapshotBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  line: {
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 9,
    lineHeight: 12,
    marginRight: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginVertical: 3,
  },
  eventsBlock: {
    flexDirection: 'column',
  },
  eventLine: {
    color: '#FFD37C',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 9,
    lineHeight: 12,
  },
});
