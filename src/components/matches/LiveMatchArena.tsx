import { memo, useMemo } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { AndroidLiveMatchPerfPanel } from '@/components/matches/AndroidLiveMatchPerfPanel';
import { DuelRoad } from '@/components/matches/liveMatchArena/DuelRoad';
import { GroupRoad } from '@/components/matches/liveMatchArena/GroupRoad';
import {
  areParticipantArraysEqual,
  areStringArraysEqual,
  buildAndroidLightParticipants,
  sortGroupParticipants,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import { useAndroidLiveMatchPerfProbe } from '@/components/matches/useAndroidLiveMatchPerfProbe';

type LiveMatchArenaProps = {
  mode: 'duel' | 'group';
  targetDistanceKm: number;
  title: string;
  subtitle: string;
  summaryChips: string[];
  participants: ArenaParticipant[];
  footer?: string;
};

const SummaryChip = memo(function SummaryChip({ label }: { label: string }) {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryChipText}>{label}</Text>
    </View>
  );
});

export const LiveMatchArena = memo(function LiveMatchArena({
  mode,
  targetDistanceKm,
  title,
  subtitle,
  summaryChips,
  participants,
  footer,
}: LiveMatchArenaProps) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, windowWidth - 32);
  const perfLabel = mode === 'duel' ? 'duel-arena' : 'group-arena';
  const visibleGroupParticipants = useMemo(() => {
    if (mode !== 'group') {
      return [];
    }

    return buildAndroidLightParticipants(sortGroupParticipants(participants));
  }, [mode, participants]);
  const visibleParticipantsCount = mode === 'group' ? visibleGroupParticipants.length : participants.length;

  useAndroidLiveMatchPerfProbe({
    label: perfLabel,
    mode,
    participants: participants.length,
    visibleParticipants: visibleParticipantsCount,
    targetDistanceKm,
  });

  const perfPanel = useMemo(
    () => <AndroidLiveMatchPerfPanel label={perfLabel} />,
    [perfLabel],
  );

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <Text style={styles.eyebrow}>{mode === 'duel' ? 'DUEL ROAD' : 'GROUP ROAD'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.summaryChipRow}>
        {summaryChips.map((chip) => (
          <SummaryChip key={chip} label={chip} />
        ))}
      </View>
      {perfPanel}
      {mode === 'duel' ? (
        <DuelRoad participants={participants} targetDistanceKm={targetDistanceKm} />
      ) : (
        <GroupRoad participants={visibleGroupParticipants} targetDistanceKm={targetDistanceKm} />
      )}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.mode === nextProps.mode
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && prevProps.title === nextProps.title
  && prevProps.subtitle === nextProps.subtitle
  && prevProps.footer === nextProps.footer
  && areStringArraysEqual(prevProps.summaryChips, nextProps.summaryChips)
  && areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
