import { StyleSheet, Text, View } from 'react-native';

type RaceBoardRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel?: string;
  distanceKm: number;
  remainingKm: number;
  progress: number;
  isCurrentUser?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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
          const isForfeited = row.liveStatus === 'forfeited';
          const rawProgress = clamp(row.progress, 0, 1);
          const lineProgressPercent = `${rawProgress * 100}%` as const;
          const dotProgressPercent = `${clamp(rawProgress, 0.04, 0.96) * 100}%` as const;

          return (
            <View
              key={row.id}
              style={[
                styles.row,
                row.isCurrentUser ? styles.rowCurrent : undefined,
                isForfeited ? styles.rowForfeited : undefined,
              ]}
            >
              <View style={styles.nameColumn}>
                <Text style={[styles.rankText, isForfeited ? styles.rankTextForfeited : undefined]}>{row.rank}위</Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.nameText,
                    row.isCurrentUser ? styles.nameTextCurrent : undefined,
                    isForfeited ? styles.nameTextForfeited : undefined,
                  ]}
                >
                  {row.isCurrentUser ? '나' : row.name}
                </Text>
              </View>
              <View style={styles.trackColumn}>
                <View style={styles.trackStack}>
                  <View style={styles.trackLine}>
                    <View
                      style={[
                        styles.trackProgress,
                        row.isCurrentUser ? styles.trackProgressCurrent : undefined,
                        isForfeited ? styles.trackProgressForfeited : undefined,
                        { width: lineProgressPercent },
                      ]}
                    />
                    <View
                      style={[
                        styles.trackDot,
                        row.isCurrentUser ? styles.trackDotCurrent : undefined,
                        isForfeited ? styles.trackDotForfeited : undefined,
                        { left: dotProgressPercent },
                      ]}
                    >
                      {isForfeited ? <Text style={styles.trackDotForfeitedText}>기권</Text> : null}
                    </View>
                  </View>
                  <Text style={[styles.distanceText, { left: dotProgressPercent }]}>
                    {row.distanceKm.toFixed(2)}km
                  </Text>
                </View>
              </View>
              <View style={styles.metaColumn}>
                <Text style={[styles.metaRemaining, isForfeited ? styles.metaRemainingForfeited : undefined]}>
                  {isForfeited ? '기권' : `${row.remainingKm.toFixed(2)}km 남음`}
                </Text>
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
    gap: 16,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#1F2A44',
    backgroundColor: '#0F172A',
    padding: 20,
  },
  eyebrow: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#E5E7EB',
    fontSize: 17,
    lineHeight: 25,
  },
  rows: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 94,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  rowCurrent: {
    borderColor: 'rgba(129,140,248,0.82)',
    backgroundColor: 'rgba(79,70,229,0.22)',
  },
  rowForfeited: {
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(127,29,29,0.22)',
  },
  nameColumn: {
    width: 82,
    gap: 4,
  },
  rankText: {
    color: '#A5B4FC',
    fontSize: 16,
    fontWeight: '800',
  },
  rankTextForfeited: {
    color: '#FCA5A5',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  nameTextCurrent: {
    color: '#E0E7FF',
  },
  nameTextForfeited: {
    color: '#FECACA',
  },
  trackColumn: {
    flex: 1,
    minWidth: 88,
  },
  trackStack: {
    position: 'relative',
    height: 48,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  trackLine: {
    position: 'relative',
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(109,94,247,0.46)',
  },
  trackProgressCurrent: {
    backgroundColor: 'rgba(129,140,248,0.58)',
  },
  trackProgressForfeited: {
    backgroundColor: 'rgba(248,113,113,0.42)',
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: '#6D5EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDotCurrent: {
    borderColor: '#7C6DFF',
  },
  trackDotForfeited: {
    width: 38,
    height: 38,
    marginTop: -19,
    marginLeft: -19,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  trackDotForfeitedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  distanceText: {
    position: 'absolute',
    top: 26,
    marginLeft: -24,
    color: '#E0E7FF',
    fontSize: 16,
    fontWeight: '800',
  },
  metaColumn: {
    width: 96,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaRemaining: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: '#FCA5A5',
  },
});
