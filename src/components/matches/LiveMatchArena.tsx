import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

type ArenaParticipant = {
  id: string;
  name: string;
  paceLabel: string;
  bpmLabel?: string | null;
  distanceKm: number;
  rankLabel?: string;
  isCurrentUser?: boolean;
  isLeader?: boolean;
  showPaceBubble?: boolean;
  emphasis?: 'featured' | 'compact';
};

function getTrackPoint(progress: number, laneIndex: number, width: number, height: number, markerSize: number) {
  const normalized = Math.max(0, Math.min(1, progress));
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width / 2 - 34 - laneIndex * 8;
  const radiusY = height / 2 - 42 - laneIndex * 8;
  const angle = -Math.PI / 2 + normalized * Math.PI * 2;

  return {
    left: centerX + radiusX * Math.cos(angle) - markerSize / 2,
    top: centerY + radiusY * Math.sin(angle) - markerSize / 2,
  };
}

function getDuelTrackPoint(progress: number, laneIndex: number, width: number, height: number, markerSize: number) {
  const normalized = Math.max(0, Math.min(1, progress));
  const trackPaddingX = 34;
  const minLeft = trackPaddingX;
  const maxLeft = Math.max(trackPaddingX, width - trackPaddingX - markerSize);
  const laneOffsetY = laneIndex === 0 ? -54 : 54;

  return {
    left: minLeft + normalized * (maxLeft - minLeft),
    top: height / 2 + laneOffsetY - markerSize / 2,
  };
}

function buildInitialLabel(name: string) {
  return name.slice(0, 1);
}

function buildBubbleLabel(participant: ArenaParticipant) {
  return participant.bpmLabel ? `${participant.paceLabel} · ${participant.bpmLabel}` : participant.paceLabel;
}

export function LiveMatchArena({
  mode,
  targetDistanceKm,
  title,
  subtitle,
  summaryChips,
  participants,
  footer,
}: {
  mode: 'duel' | 'group';
  targetDistanceKm: number;
  title: string;
  subtitle: string;
  summaryChips: string[];
  participants: ArenaParticipant[];
  footer?: string;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, windowWidth - 32);
  const arenaHeight = mode === 'duel' ? 320 : 380;
  const markerSize = mode === 'duel' ? 52 : 28;
  const laneCount = mode === 'duel' ? 2 : 5;

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <Text style={styles.eyebrow}>{mode === 'duel' ? 'DUEL ARENA' : 'GROUP ARENA'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.summaryChipRow}>
        {summaryChips.map((chip) => (
          <View key={chip} style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>{chip}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.trackWrap, { height: arenaHeight }]}>
        {Array.from({ length: laneCount }).map((_, index) => (
          <View
            key={`lane-${index}`}
            style={[
              styles.trackLane,
              {
                top: 16 + index * 8,
                right: 16 + index * 8,
                bottom: 16 + index * 8,
                left: 16 + index * 8,
              },
            ]}
          />
        ))}
        <View style={styles.finishLine} />
        {participants.map((participant, index) => {
          const laneIndex = mode === 'duel' ? index : index % laneCount;
          const isCompact = mode === 'group' && participant.emphasis === 'compact';
          const participantMarkerSize = mode === 'duel'
            ? markerSize
            : isCompact
              ? 18
              : 30;
          const progress = targetDistanceKm > 0 ? participant.distanceKm / targetDistanceKm : 0;
          const point = mode === 'duel'
            ? getDuelTrackPoint(progress, laneIndex, cardWidth - 32, arenaHeight, participantMarkerSize)
            : getTrackPoint(progress, laneIndex, cardWidth - 32, arenaHeight, participantMarkerSize);

          return (
            <View
              key={participant.id}
              style={[
                styles.runnerWrap,
                {
                  width: isCompact ? 54 : 78,
                  left: point.left,
                  top: point.top,
                },
              ]}
            >
              {participant.showPaceBubble ? (
                <View
                  style={[
                    styles.paceBubble,
                    participant.isCurrentUser ? styles.paceBubbleCurrent : undefined,
                    isCompact ? styles.paceBubbleCompact : undefined,
                  ]}
                >
                  <Text style={[styles.paceBubbleText, isCompact ? styles.paceBubbleTextCompact : undefined]}>
                    {buildBubbleLabel(participant)}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.runnerMarker,
                  mode === 'duel'
                    ? styles.runnerMarkerLarge
                    : isCompact
                      ? styles.runnerMarkerCompact
                      : styles.runnerMarkerMedium,
                  participant.isCurrentUser ? styles.runnerMarkerCurrent : participant.isLeader ? styles.runnerMarkerLeader : styles.runnerMarkerDefault,
                ]}
              >
                <Text
                  style={[
                    styles.runnerMarkerText,
                    mode === 'duel' ? styles.runnerMarkerTextLarge : undefined,
                    isCompact ? styles.runnerMarkerTextCompact : undefined,
                  ]}
                >
                  {mode === 'duel' ? buildInitialLabel(participant.name) : participant.rankLabel ?? buildInitialLabel(participant.name)}
                </Text>
              </View>
              {isCompact ? (
                <Text style={styles.runnerCompactMeta}>{participant.distanceKm.toFixed(1)}km</Text>
              ) : (
                <View style={styles.runnerLabelWrap}>
                  <Text style={styles.runnerLabelName}>
                    {participant.isCurrentUser ? '나' : participant.name}
                  </Text>
                  <Text style={styles.runnerLabelMeta}>{participant.distanceKm.toFixed(2)}km</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1F2A44',
    backgroundColor: '#0F172A',
    padding: 16,
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
  summaryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  trackWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#312E81',
  },
  trackLane: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  finishLine: {
    position: 'absolute',
    top: 10,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  runnerWrap: {
    position: 'absolute',
    alignItems: 'center',
    width: 78,
  },
  paceBubble: {
    marginBottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paceBubbleCurrent: {
    backgroundColor: 'rgba(129, 140, 248, 0.32)',
  },
  paceBubbleCompact: {
    marginBottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  paceBubbleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  paceBubbleTextCompact: {
    fontSize: 9,
  },
  runnerMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
  },
  runnerMarkerLarge: {
    width: 52,
    height: 52,
  },
  runnerMarkerMedium: {
    width: 30,
    height: 30,
  },
  runnerMarkerCompact: {
    width: 18,
    height: 18,
  },
  runnerMarkerCurrent: {
    backgroundColor: '#6D5EF7',
    borderColor: '#E0E7FF',
  },
  runnerMarkerLeader: {
    backgroundColor: '#F59E0B',
    borderColor: '#FEF3C7',
  },
  runnerMarkerDefault: {
    backgroundColor: '#1F2937',
    borderColor: '#475467',
  },
  runnerMarkerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  runnerMarkerTextLarge: {
    fontSize: 18,
  },
  runnerMarkerTextCompact: {
    fontSize: 8,
  },
  runnerLabelWrap: {
    marginTop: 6,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  runnerLabelName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  runnerLabelMeta: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '700',
  },
  runnerCompactMeta: {
    marginTop: 4,
    color: '#C7D2FE',
    fontSize: 9,
    fontWeight: '700',
  },
  footer: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
  },
});
