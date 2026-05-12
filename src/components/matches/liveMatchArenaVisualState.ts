export type LiveMatchRunnerVisualParticipant = {
  name: string;
  paceLabel: string;
  bpmLabel?: string | null;
  isCurrentUser?: boolean;
  isLeader?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
};

export type LiveMatchRunnerVisualState = {
  isForfeited: boolean;
  markerLabel: string;
  markerTone: 'current' | 'leader' | 'opponent' | 'forfeited';
  bubbleLabel: string;
  averagePaceLabel: string;
};

function buildBubbleLabel(participant: LiveMatchRunnerVisualParticipant) {
  return participant.bpmLabel ? `${participant.paceLabel} · ${participant.bpmLabel}` : participant.paceLabel;
}

export function isRunnerForfeited(participant: Pick<LiveMatchRunnerVisualParticipant, 'liveStatus'>) {
  return participant.liveStatus === 'forfeited';
}

export function buildLiveMatchRunnerVisualState(
  participant: LiveMatchRunnerVisualParticipant,
  fallbackMarkerLabel: string,
): LiveMatchRunnerVisualState {
  const isForfeited = isRunnerForfeited(participant);
  const paceLabel = buildBubbleLabel(participant).trim();
  const markerTone = isForfeited
    ? 'forfeited'
    : participant.isCurrentUser
      ? 'current'
      : participant.isLeader
        ? 'leader'
        : 'opponent';

  if (isForfeited) {
    return {
      isForfeited,
      markerLabel: '기권',
      markerTone,
      bubbleLabel: '기권 처리됨',
      averagePaceLabel: '기권',
    };
  }

  const normalizedPaceLabel = paceLabel || '평균 계산 중';
  const shouldUsePaceAsIs = (
    normalizedPaceLabel.includes('평균')
    || normalizedPaceLabel.includes('측정')
    || normalizedPaceLabel.includes('계산')
  );
  const averagePaceLabel = shouldUsePaceAsIs
    ? normalizedPaceLabel
    : `평균 ${normalizedPaceLabel}`;

  return {
    isForfeited,
    markerLabel: fallbackMarkerLabel,
    markerTone,
    bubbleLabel: averagePaceLabel,
    averagePaceLabel,
  };
}
