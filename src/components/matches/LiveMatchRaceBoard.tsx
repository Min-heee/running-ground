import { StyleSheet, Text, View } from 'react-native';

type RaceBoardRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel: string;
  distanceKm: number;
  remainingKm: number;
  progress: number;
  isCurrentUser?: boolean;
};

export function LiveMatchRaceBoard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: RaceBoardRow[];
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>RACE BOARD</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.rows}>
        {rows.map((row) => {
          const progressPercent = `${Math.max(0, Math.min(100, row.progress * 100))}%` as const;

          return (
            <View
              key={row.id}
              style={[styles.row, row.isCurrentUser ? styles.rowCurrent : undefined]}
            >
              <View style={styles.nameColumn}>
                <Text style={styles.rankText}>{row.rank}위</Text>
                <Text style={[styles.nameText, row.isCurrentUser ? styles.nameTextCurrent : undefined]}>
                  {row.isCurrentUser ? '나' : row.name}
                </Text>
              </View>
              <View style={styles.trackColumn}>
                <View style={styles.trackLine}>
                  <View style={[styles.trackProgress, { width: progressPercent }]} />
                  <View style={[styles.trackDot, { left: progressPercent }]} />
                </View>
                <Text style={styles.distanceText}>{row.distanceKm.toFixed(2)}km</Text>
              </View>
              <View style={styles.metaColumn}>
                <Text style={styles.metaPace}>{row.paceLabel}</Text>
                <Text style={styles.metaRemaining}>{row.remainingKm.toFixed(2)}km 남음</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  eyebrow: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#D0D5DD',
    fontSize: 14,
    lineHeight: 20,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowCurrent: {
    borderColor: 'rgba(129,140,248,0.62)',
    backgroundColor: 'rgba(79,70,229,0.18)',
  },
  nameColumn: {
    width: 78,
    gap: 2,
  },
  rankText: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '800',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  nameTextCurrent: {
    color: '#E0E7FF',
  },
  trackColumn: {
    flex: 1,
    gap: 8,
  },
  trackLine: {
    position: 'relative',
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#6D5EF7',
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -7,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#6D5EF7',
  },
  distanceText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
  },
  metaColumn: {
    width: 92,
    alignItems: 'flex-end',
    gap: 2,
  },
  metaPace: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  metaRemaining: {
    color: '#98A2B3',
    fontSize: 11,
    fontWeight: '700',
  },
});
