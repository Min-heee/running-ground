import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { recordLiveMatchPerfSample } from '@/components/matches/liveMatchPerfQaLog';

export const LIVE_MATCH_PERF_QA_ENABLED = __DEV__ && Platform.OS === 'android';

type LiveMatchPerfProbeInput = {
  label: string;
  mode: 'duel' | 'group';
  participants: number;
  visibleParticipants?: number;
  participantSignature: string;
  visibleParticipantSignature?: string;
  targetDistanceKm: number;
};

type RenderDetails = {
  mode: 'duel' | 'group';
  participants: number;
  visibleParticipants?: number;
  participantSignature: string;
  visibleParticipantSignature?: string;
  targetDistanceKm: number;
};

type RenderReasonCounts = {
  progressUpdates: number;
  visibleProgressUpdates: number;
  hiddenProgressUpdates: number;
  layoutUpdates: number;
  targetUpdates: number;
  staticRenders: number;
};

function createRenderReasonCounts(): RenderReasonCounts {
  return {
    progressUpdates: 0,
    visibleProgressUpdates: 0,
    hiddenProgressUpdates: 0,
    layoutUpdates: 0,
    targetUpdates: 0,
    staticRenders: 0,
  };
}

export function useAndroidLiveMatchPerfProbe({
  label,
  mode,
  participants,
  visibleParticipants,
  participantSignature,
  visibleParticipantSignature,
  targetDistanceKm,
}: LiveMatchPerfProbeInput) {
  const renderCountRef = useRef(0);
  const detailRef = useRef<RenderDetails>({
    mode,
    participants,
    visibleParticipants,
    participantSignature,
    visibleParticipantSignature,
    targetDistanceKm,
  });
  const previousRenderDetailRef = useRef<RenderDetails | null>(null);
  const renderReasonCountsRef = useRef<RenderReasonCounts>(createRenderReasonCounts());

  renderCountRef.current += 1;

  const nextDetails = {
    mode,
    participants,
    visibleParticipants,
    participantSignature,
    visibleParticipantSignature,
    targetDistanceKm,
  };
  const previousDetails = previousRenderDetailRef.current;

  if (previousDetails) {
    let explainedByChange = false;
    const participantSignatureChanged = previousDetails.participantSignature !== participantSignature;
    const visibleParticipantSignatureChanged =
      previousDetails.visibleParticipantSignature !== visibleParticipantSignature;

    if (participantSignatureChanged) {
      renderReasonCountsRef.current.progressUpdates += 1;
      explainedByChange = true;
    }

    if (visibleParticipantSignatureChanged) {
      renderReasonCountsRef.current.visibleProgressUpdates += 1;
      explainedByChange = true;
    }

    if (participantSignatureChanged && !visibleParticipantSignatureChanged) {
      renderReasonCountsRef.current.hiddenProgressUpdates += 1;
    }

    if (
      previousDetails.mode !== mode
      || previousDetails.participants !== participants
      || previousDetails.visibleParticipants !== visibleParticipants
    ) {
      renderReasonCountsRef.current.layoutUpdates += 1;
      explainedByChange = true;
    }

    if (previousDetails.targetDistanceKm !== targetDistanceKm) {
      renderReasonCountsRef.current.targetUpdates += 1;
      explainedByChange = true;
    }

    if (!explainedByChange) {
      renderReasonCountsRef.current.staticRenders += 1;
    }
  }

  previousRenderDetailRef.current = nextDetails;
  detailRef.current = {
    mode,
    participants,
    visibleParticipants,
    participantSignature,
    visibleParticipantSignature,
    targetDistanceKm,
  };

  useEffect(() => {
    if (!LIVE_MATCH_PERF_QA_ENABLED) {
      return undefined;
    }

    let frameCount = 0;
    let frameRef = 0;
    let windowStartedAt = Date.now();
    let renderCountAtStart = renderCountRef.current;

    const tick = () => {
      frameCount += 1;
      const now = Date.now();
      const elapsedMs = now - windowStartedAt;

      if (elapsedMs >= 5000) {
        const fps = Math.round((frameCount * 1000) / Math.max(1, elapsedMs));
        const renders = renderCountRef.current - renderCountAtStart;
        const details = detailRef.current;
        const renderReasonCounts = renderReasonCountsRef.current;
        recordLiveMatchPerfSample({
          label,
          mode: details.mode,
          fps,
          renders,
          progressUpdates: renderReasonCounts.progressUpdates,
          visibleProgressUpdates: renderReasonCounts.visibleProgressUpdates,
          hiddenProgressUpdates: renderReasonCounts.hiddenProgressUpdates,
          layoutUpdates: renderReasonCounts.layoutUpdates,
          targetUpdates: renderReasonCounts.targetUpdates,
          staticRenders: renderReasonCounts.staticRenders,
          windowMs: elapsedMs,
          participants: details.participants,
          visibleParticipants: details.visibleParticipants,
          targetDistanceKm: details.targetDistanceKm,
          capturedAt: now,
        });

        // eslint-disable-next-line no-console
        console.debug(
          `[LiveMatchPerf] ${label} fps=${fps} renders=${renders}/5s `
          + `participants=${details.participants}`
          + (typeof details.visibleParticipants === 'number' ? ` visible=${details.visibleParticipants}` : '')
          + ` target=${details.targetDistanceKm}`
          + ` progress=${renderReasonCounts.progressUpdates}`
          + ` visibleProgress=${renderReasonCounts.visibleProgressUpdates}`
          + ` hiddenProgress=${renderReasonCounts.hiddenProgressUpdates}`
          + ` static=${renderReasonCounts.staticRenders}`
          + ` layout=${renderReasonCounts.layoutUpdates}`,
        );
        frameCount = 0;
        windowStartedAt = now;
        renderCountAtStart = renderCountRef.current;
        renderReasonCountsRef.current = createRenderReasonCounts();
      }

      frameRef = requestAnimationFrame(tick);
    };

    frameRef = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef);
    };
  }, [label]);
}
