import type {
  DuelResultLabel,
  MatchResultDisplayMode,
  ParticipantArenaLabel,
  ParticipantLiveStatus,
  ParticipantViewState,
  ParticipantViewStateInput,
  ProgressiveParticipant,
} from '@/features/runs/types/matchResult';

export type {
  DuelResultLabel,
  MatchResultDisplayMode,
  ParticipantArenaLabel,
  ParticipantViewState,
  ParticipantViewStateInput,
  ProgressiveParticipant,
} from '@/features/runs/types/matchResult';

function isTerminalStatus(status: ParticipantLiveStatus | undefined) {
  return status === 'finished' || status === 'forfeited';
}

function isFinishedStatus(status: ParticipantLiveStatus | undefined) {
  return status === 'finished';
}

function readFinishedAtMs(participant: Pick<ProgressiveParticipant, 'finishedAt'>) {
  if (typeof participant.finishedAt !== 'string' || !participant.finishedAt.trim()) {
    return null;
  }

  const parsed = Date.parse(participant.finishedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareFinishedAt(
  currentUser: Pick<ProgressiveParticipant, 'finishedAt'>,
  opponent: Pick<ProgressiveParticipant, 'finishedAt'>,
): DuelResultLabel | null {
  const currentFinishedAtMs = readFinishedAtMs(currentUser);
  const opponentFinishedAtMs = readFinishedAtMs(opponent);

  if (currentFinishedAtMs === null || opponentFinishedAtMs === null) {
    return null;
  }

  if (currentFinishedAtMs < opponentFinishedAtMs) {
    return 'WIN';
  }

  if (currentFinishedAtMs > opponentFinishedAtMs) {
    return 'LOSE';
  }

  return 'DRAW';
}

export function resolveParticipantViewState({
  participant,
  isCurrentUserFinished,
}: ParticipantViewStateInput): ParticipantViewState {
  const isTerminal = isTerminalStatus(participant.liveStatus);

  if (participant.isCurrentUser) {
    return isTerminal ? 'finished-self' : 'running';
  }

  if (isTerminal) {
    return 'finished-other-visible';
  }

  return isCurrentUserFinished ? 'running' : 'finished-other-hidden';
}

export function shouldShowParticipantInRaceBoard(viewState: ParticipantViewState): boolean {
  return viewState !== 'finished-other-hidden';
}

export function getCurrentUserResultLabel(
  currentUser: ProgressiveParticipant | null | undefined,
  opponent: ProgressiveParticipant | null | undefined,
  mode: MatchResultDisplayMode,
): DuelResultLabel | null {
  if (mode !== 'duel' || !currentUser || !opponent) {
    return null;
  }

  const currentStatus = currentUser.liveStatus;
  const opponentStatus = opponent.liveStatus;
  const currentTerminal = isTerminalStatus(currentStatus);
  const opponentTerminal = isTerminalStatus(opponentStatus);

  if (currentStatus === 'forfeited' && opponentStatus === 'forfeited') {
    return 'DRAW';
  }

  if (currentStatus === 'forfeited') {
    return 'LOSE';
  }

  if (opponentStatus === 'forfeited') {
    return 'WIN';
  }

  if (isFinishedStatus(currentStatus) && !opponentTerminal) {
    return 'WIN';
  }

  if (!currentTerminal && isFinishedStatus(opponentStatus)) {
    return null;
  }

  if (isFinishedStatus(currentStatus) && isFinishedStatus(opponentStatus)) {
    return compareFinishedAt(currentUser, opponent);
  }

  return null;
}

export function getParticipantArenaLabel(
  participant: ProgressiveParticipant,
  mode: MatchResultDisplayMode,
  currentUserFinishedAt: string | null,
  currentUserResultLabel: DuelResultLabel | null = null,
): ParticipantArenaLabel | null {
  const isTerminal = isTerminalStatus(participant.liveStatus);

  if (!isTerminal) {
    return null;
  }

  if (mode === 'group') {
    return participant.rankLabel
      ? { kind: 'rank', text: participant.rankLabel }
      : null;
  }

  if (participant.isCurrentUser) {
    return currentUserResultLabel
      ? { kind: 'result', text: currentUserResultLabel }
      : null;
  }

  if (participant.liveStatus === 'forfeited') {
    return { kind: 'result', text: 'LOSE' };
  }

  const currentFinishedAtMs = readFinishedAtMs({ finishedAt: currentUserFinishedAt });
  const participantFinishedAtMs = readFinishedAtMs(participant);

  if (participantFinishedAtMs === null) {
    return null;
  }

  if (currentFinishedAtMs === null) {
    return { kind: 'result', text: 'WIN' };
  }

  if (participantFinishedAtMs < currentFinishedAtMs) {
    return { kind: 'result', text: 'WIN' };
  }

  if (participantFinishedAtMs > currentFinishedAtMs) {
    return { kind: 'result', text: 'LOSE' };
  }

  return { kind: 'result', text: 'DRAW' };
}

export function isCurrentUserFinished(
  participants: Pick<ProgressiveParticipant, 'isCurrentUser' | 'liveStatus'>[],
): boolean {
  const currentUser = participants.find((participant) => participant.isCurrentUser);
  return isTerminalStatus(currentUser?.liveStatus);
}

export function shouldShowResultPage(
  currentUserFinished: boolean,
  _mode: MatchResultDisplayMode,
): boolean {
  return currentUserFinished;
}
