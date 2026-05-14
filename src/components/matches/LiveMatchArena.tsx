import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { AndroidLiveMatchPerfPanel } from '@/components/matches/AndroidLiveMatchPerfPanel';
import { DuelRoad } from '@/components/matches/liveMatchArena/DuelRoad';
import { GroupRoad } from '@/components/matches/liveMatchArena/GroupRoad';
import {
  areParticipantArraysEqual,
  areStringArraysEqual,
  buildAndroidLightParticipants,
  buildAndroidRenderParticipants,
  buildParticipantPerfSignature,
  sortGroupParticipants,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import {
  LIVE_MATCH_PERF_QA_ENABLED,
  useAndroidLiveMatchPerfProbe,
} from '@/components/matches/useAndroidLiveMatchPerfProbe';
import { rgPerfMark } from '@/utils/rgPerfTrace';
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

const SummaryChip = memo(function SummaryChip({ label }: { label: string }) {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryChipText}>{label}</Text>
    </View>
  );
});

const ArenaHeader = memo(function ArenaHeader({
  mode,
  title,
  subtitle,
}: {
  mode: 'duel' | 'group';
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <Text style={styles.eyebrow}>{mode === 'duel' ? 'DUEL ROAD' : 'GROUP ROAD'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </>
  );
});

const SummaryChipRow = memo(function SummaryChipRow({
  chips,
}: {
  chips: string[];
}) {
  const summaryChipItems = useMemo(
    () => chips.map((chip) => <SummaryChip key={chip} label={chip} />),
    [chips],
  );

  return (
    <View style={styles.summaryChipRow}>
      {summaryChipItems}
    </View>
  );
}, (prevProps, nextProps) => areStringArraysEqual(prevProps.chips, nextProps.chips));

const LiveMatchStartupRoad = memo(function LiveMatchStartupRoad() {
  return (
    <View style={styles.startupRoadShell}>
      <Text style={styles.startupRoadText}>대결 화면 준비 중...</Text>
    </View>
  );
});

function buildLiveMatchScreenIdentity({
  matchId,
  mode,
}: {
  matchId?: string | null;
  mode: 'duel' | 'group';
}) {
  return `${mode}:${matchId ?? 'pending'}`;
}

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
  const arenaIdentity = useMemo(
    () => buildLiveMatchScreenIdentity({ matchId, mode }),
    [matchId, mode],
  );
  const onMountedRef = useRef(onMounted);
  const mountedSignalIdentityRef = useRef<string | null>(null);
  const lastDeferHeavyContentRef = useRef(deferHeavyContent);
  const hydrationLoggedIdentityRef = useRef<string | null>(null);
  const preservedRoadMotionIdentityRef = useRef<string | null>(null);
  const mountDetailRef = useRef({
    deferHeavyContent: false,
    participants: 0,
  });
  const [hydratedHeavyContentIdentity, setHydratedHeavyContentIdentity] = useState<string | null>(null);
  const isHeavyContentHydrated = hydratedHeavyContentIdentity === arenaIdentity;
  const shouldDeferHeavyContent = deferHeavyContent && !isHeavyContentHydrated;

  useEffect(() => {
    onMountedRef.current = onMounted;
  }, [onMounted]);

  useEffect(() => {
    mountDetailRef.current = {
      deferHeavyContent: shouldDeferHeavyContent,
      participants: participants.length,
    };
  }, [participants.length, shouldDeferHeavyContent]);

  useEffect(() => {
    if (!deferHeavyContent && !isHeavyContentHydrated) {
      setHydratedHeavyContentIdentity(arenaIdentity);

      if (hydrationLoggedIdentityRef.current !== arenaIdentity) {
        hydrationLoggedIdentityRef.current = arenaIdentity;
        rgPerfMark('heavy content hydrated without remount', {
          matchId: matchId ?? null,
          mode,
        });
      }
    }
  }, [arenaIdentity, deferHeavyContent, isHeavyContentHydrated, matchId, mode]);

  useEffect(() => {
    if (mountedSignalIdentityRef.current === arenaIdentity) {
      rgPerfMark('live match remount prevented same match', {
        matchId: matchId ?? null,
        mode,
        reason: 'duplicate mount signal',
      });
      return undefined;
    }

    mountedSignalIdentityRef.current = arenaIdentity;
    onMountedRef.current?.({
      matchId,
      mode,
      source: 'LiveMatchArena',
    });
    rgPerfMark('live match screen mount', {
      deferHeavyContent: mountDetailRef.current.deferHeavyContent,
      matchId: matchId ?? null,
      mode,
      participants: mountDetailRef.current.participants,
    });

    return () => {
      rgPerfMark('live match screen unmount', {
        matchId: matchId ?? null,
        mode,
      });
      if (mountedSignalIdentityRef.current === arenaIdentity) {
        mountedSignalIdentityRef.current = null;
      }
    };
  }, [arenaIdentity, matchId, mode]);

  useEffect(() => {
    if (lastDeferHeavyContentRef.current !== deferHeavyContent) {
      rgPerfMark('live match remount prevented same match', {
        deferHeavyContent,
        matchId: matchId ?? null,
        mode,
        reason: 'defer state changed',
      });
      lastDeferHeavyContentRef.current = deferHeavyContent;
    }
  }, [deferHeavyContent, matchId, mode]);

  useEffect(() => {
    if (
      deferHeavyContent
      && isHeavyContentHydrated
      && preservedRoadMotionIdentityRef.current !== arenaIdentity
    ) {
      preservedRoadMotionIdentityRef.current = arenaIdentity;
      rgPerfMark('RoadMotion preserved same match', {
        matchId: matchId ?? null,
        mode,
      });
    }
  }, [arenaIdentity, deferHeavyContent, isHeavyContentHydrated, matchId, mode]);

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
  const visibleParticipantsCount = mode === 'group' ? visibleGroupParticipants.length : participants.length;
  const visibleParticipants = mode === 'duel' ? duelParticipants : visibleGroupParticipants;
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
      <ArenaHeader mode={mode} title={title} subtitle={subtitle} />
      <SummaryChipRow chips={summaryChips} />
      {perfPanel}
      {shouldDeferHeavyContent ? (
        <LiveMatchStartupRoad />
      ) : mode === 'duel' ? (
        <DuelRoad participants={duelParticipants} targetDistanceKm={targetDistanceKm} />
      ) : (
        <GroupRoad participants={visibleGroupParticipants} targetDistanceKm={targetDistanceKm} />
      )}
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
