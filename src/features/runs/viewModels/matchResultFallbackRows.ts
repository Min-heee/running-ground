import { formatDuration } from '@/features/runs/tracking';
import type {
  DuelMatchResultRow,
  GroupMatchResultRow,
} from '@/features/runs/types/matchResult';
import type { ForfeitedMatchSnapshot } from '@/features/runs/types/matchForfeit';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';

function resolveForfeitRowMetrics({
  currentUserForfeitSnapshot,
  liveElapsedSeconds,
  participant,
}: {
  currentUserForfeitSnapshot: ForfeitedMatchSnapshot | null;
  liveElapsedSeconds: number;
  participant: ArenaParticipantViewModel;
}) {
  const shouldUseCurrentUserSnapshot = Boolean(participant.isCurrentUser && currentUserForfeitSnapshot);
  const shouldUseParticipantSnapshot = participant.liveStatus === 'forfeited'
    && typeof participant.elapsedSeconds === 'number'
    && participant.elapsedSeconds > 0;
  const shouldFreezeForfeitedParticipant = participant.liveStatus === 'forfeited';
  const elapsedSeconds = shouldUseCurrentUserSnapshot
    ? currentUserForfeitSnapshot!.elapsedSeconds
    : shouldUseParticipantSnapshot
      ? participant.elapsedSeconds!
      : shouldFreezeForfeitedParticipant
        ? 0
        : liveElapsedSeconds;
  const paceLabel = shouldUseCurrentUserSnapshot
    ? currentUserForfeitSnapshot!.paceLabel
    : ((participant.progressPaceLabel ?? participant.paceLabel) || '--:--/km');

  return {
    durationLabel: formatDuration(elapsedSeconds),
    paceLabel,
  };
}

export function buildRoomLinkedDuelForfeitResultRows({
  currentUserForfeitSnapshot,
  liveElapsedSeconds,
  participants,
}: {
  currentUserForfeitSnapshot: ForfeitedMatchSnapshot | null;
  liveElapsedSeconds: number;
  participants: ArenaParticipantViewModel[];
}): DuelMatchResultRow[] {
  return participants.map((participant) => {
    const isCurrentUser = Boolean(participant.isCurrentUser);
    const isForfeited = (isCurrentUser && currentUserForfeitSnapshot !== null) || participant.liveStatus === 'forfeited';
    const isFinished = participant.liveStatus === 'finished';
    const { durationLabel, paceLabel } = resolveForfeitRowMetrics({
      currentUserForfeitSnapshot,
      liveElapsedSeconds,
      participant,
    });
    return {
      id: participant.id,
      resultLabel: isForfeited ? 'FORFEIT' : isFinished ? 'WIN' : 'ING',
      name: participant.name,
      paceLabel,
      durationLabel,
      isCurrentUser,
      isInProgress: !isForfeited && !isFinished,
    };
  });
}

export function buildRoomLinkedGroupForfeitResultRows({
  currentUserForfeitSnapshot,
  liveElapsedSeconds,
  participants,
}: {
  currentUserForfeitSnapshot: ForfeitedMatchSnapshot | null;
  liveElapsedSeconds: number;
  participants: ArenaParticipantViewModel[];
}): GroupMatchResultRow[] {
  return participants.map((participant, index) => {
    const isCurrentUser = Boolean(participant.isCurrentUser);
    const isForfeited = (isCurrentUser && currentUserForfeitSnapshot !== null) || participant.liveStatus === 'forfeited';
    const isFinished = participant.liveStatus === 'finished';
    const parsedRank = Number(participant.rankLabel);
    const { durationLabel, paceLabel } = resolveForfeitRowMetrics({
      currentUserForfeitSnapshot,
      liveElapsedSeconds,
      participant,
    });
    return {
      id: participant.id,
      rank: Number.isFinite(parsedRank) && parsedRank > 0 ? parsedRank : index + 1,
      name: participant.name,
      paceLabel,
      durationLabel,
      isCurrentUser,
      isInProgress: !isForfeited && !isFinished,
    };
  });
}
