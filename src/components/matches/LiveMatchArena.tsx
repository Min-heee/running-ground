import { memo, useMemo } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { AndroidLiveMatchPerfPanel } from '@/components/matches/AndroidLiveMatchPerfPanel';
import {
  areParticipantArraysEqual,
  areStringArraysEqual,
  buildAndroidLightParticipants,
  buildAndroidRenderParticipants,
  buildParticipantPerfSignature,
  sortGroupParticipants,
} from '@/components/matches/liveMatchArena/helpers';
import { LiveMatchArenaHeader } from '@/components/matches/liveMatchArena/LiveMatchArenaHeader';
import { LiveMatchArenaRoadSection } from '@/components/matches/liveMatchArena/LiveMatchArenaRoadSection';
import { LiveMatchArenaSummaryChips } from '@/components/matches/liveMatchArena/LiveMatchArenaSummaryChips';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import {
  LIVE_MATCH_PERF_QA_ENABLED,
  useAndroidLiveMatchPerfProbe,
} from '@/components/matches/useAndroidLiveMatchPerfProbe';
import { useLiveMatchArenaMountSignals } from '@/components/matches/liveMatchArena/useLiveMatchArenaMountSignals';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

export type LiveMatchArenaProps = {
  mode: 'duel' | 'group';
  matchId?: string | null;
  targetDistanceKm: number;
  title: string;
  subtitle: string;
  summaryChips: string[];
  participants: ArenaParticipant[];
  footer?: string;
  deferHeavyContent?: boolean;
  onMounted?: (input: { matchId?: string | null; mode: 'duel' | 'group'; source: string }) => void;
};

export const LiveMatchArena = memo(function LiveMatchArena({
  mode,
  matchId,
  targetDistanceKm,
  title,
  subtitle,
  summaryChips,
  participants,
  footer,
  deferHeavyContent = false,
  onMounted,
}: LiveMatchArenaProps) {
  useDevRenderCounter(`LiveMatchArena:${mode}`);
  const { shouldDeferHeavyContent } = useLiveMatchArenaMountSignals({
    matchId,
    mode,
    participantsCount: participants.length,
    deferHeavyContent,
    onMounted,
  });

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, windowWidth - 32);
  const perfLabel = mode === 'duel' ? 'duel-arena' : 'group-arena';
  const cardStyle = useMemo(() => [styles.card, { width: cardWidth }], [cardWidth]);
  const duelParticipants = useMemo(
    () => (mode === 'duel' ? buildAndroidRenderParticipants(participants) : []),
    [mode, participants],
  );
  const visibleGroupParticipants = useMemo(() => {
    if (mode !== 'group') {
      return [];
    }

    return buildAndroidRenderParticipants(buildAndroidLightParticipants(sortGroupParticipants(participants)));
  }, [mode, participants]);
  const visibleParticipants = useMemo(
    () => (mode === 'duel' ? duelParticipants : visibleGroupParticipants),
    [duelParticipants, mode, visibleGroupParticipants],
  );
  const visibleParticipantsCount = visibleParticipants.length;
  const participantSignature = useMemo(
    () => (LIVE_MATCH_PERF_QA_ENABLED ? buildParticipantPerfSignature(participants) : ''),
    [participants],
  );
  const visibleParticipantSignature = useMemo(
    () => (LIVE_MATCH_PERF_QA_ENABLED ? buildParticipantPerfSignature(visibleParticipants) : ''),
    [visibleParticipants],
  );

  useAndroidLiveMatchPerfProbe({
    label: perfLabel,
    mode,
    participants: participants.length,
    visibleParticipants: visibleParticipantsCount,
    participantSignature,
    visibleParticipantSignature,
    targetDistanceKm,
  });

  const perfPanel = useMemo(
    () => (LIVE_MATCH_PERF_QA_ENABLED ? <AndroidLiveMatchPerfPanel label={perfLabel} /> : null),
    [perfLabel],
  );

  return (
    <View style={cardStyle}>
      <LiveMatchArenaHeader mode={mode} title={title} subtitle={subtitle} />
      <LiveMatchArenaSummaryChips chips={summaryChips} />
      {perfPanel}
      <LiveMatchArenaRoadSection
        mode={mode}
        shouldDeferHeavyContent={shouldDeferHeavyContent}
        duelParticipants={duelParticipants}
        visibleGroupParticipants={visibleGroupParticipants}
        targetDistanceKm={targetDistanceKm}
      />
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.mode === nextProps.mode
  && prevProps.matchId === nextProps.matchId
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && prevProps.title === nextProps.title
  && prevProps.subtitle === nextProps.subtitle
  && prevProps.footer === nextProps.footer
  && prevProps.deferHeavyContent === nextProps.deferHeavyContent
  && prevProps.onMounted === nextProps.onMounted
  && areStringArraysEqual(prevProps.summaryChips, nextProps.summaryChips)
  && areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
