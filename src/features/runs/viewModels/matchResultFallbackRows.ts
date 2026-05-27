import { formatDuration } from '@/features/runs/tracking';
import type {
  DuelMatchResultRow,
  GroupMatchResultRow,
} from '@/features/runs/types/matchResult';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';

export function buildRoomLinkedDuelForfeitResultRows({
  elapsedSeconds,
  participants,
}: {
  elapsedSeconds: number;
  participants: ArenaParticipantViewModel[];
}): DuelMatchResultRow[] {
  const durationLabel = formatDuration(elapsedSeconds);

  return participants.map((participant) => {
    const isCurrentUser = Boolean(participant.isCurrentUser);
    const isForfeited = isCurrentUser || participant.liveStatus === 'forfeited';
    const isFinished = participant.liveStatus === 'finished';
    return {
      id: participant.id,
      resultLabel: isForfeited ? 'FORFEIT' : isFinished ? 'WIN' : 'ING',
      name: participant.name,
      paceLabel: participant.paceLabel || '--:--/km',
      durationLabel,
      isCurrentUser,
      isInProgress: !isForfeited && !isFinished,
    };
  });
}

export function buildRoomLinkedGroupForfeitResultRows({
  elapsedSeconds,
  participants,
}: {
  elapsedSeconds: number;
  participants: ArenaParticipantViewModel[];
}): GroupMatchResultRow[] {
  const durationLabel = formatDuration(elapsedSeconds);

  return participants.map((participant, index) => {
    const isCurrentUser = Boolean(participant.isCurrentUser);
    const isForfeited = isCurrentUser || participant.liveStatus === 'forfeited';
    const isFinished = participant.liveStatus === 'finished';
    const parsedRank = Number(participant.rankLabel);
    return {
      id: participant.id,
      rank: Number.isFinite(parsedRank) && parsedRank > 0 ? parsedRank : index + 1,
      name: participant.name,
      paceLabel: participant.paceLabel || '--:--/km',
      durationLabel,
      isCurrentUser,
      isInProgress: !isForfeited && !isFinished,
    };
  });
}
