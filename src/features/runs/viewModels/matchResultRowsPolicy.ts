import type {
  DuelMatchResultRowLabel,
  DuelMatchResultRowModel,
  MatchResultTone,
} from '@/features/runs/types/matchResult';

export function resolveDuelResultTone({
  currentForfeited,
  opponentForfeited,
  opponentInProgress,
  isDraw,
  currentDistanceKm,
  opponentDistanceKm,
}: {
  currentForfeited: boolean;
  opponentForfeited: boolean;
  opponentInProgress: boolean;
  isDraw: boolean;
  currentDistanceKm: number;
  opponentDistanceKm: number;
}): MatchResultTone {
  if (currentForfeited) {
    return 'lose';
  }

  if (opponentForfeited || opponentInProgress) {
    return 'win';
  }

  if (isDraw) {
    return 'draw';
  }

  return currentDistanceKm > opponentDistanceKm ? 'win' : 'lose';
}

export function resolveDuelTitle({
  opponentName,
  currentForfeited,
  opponentForfeited,
  opponentInProgress,
  isDraw,
  resultTone,
}: {
  opponentName: string;
  currentForfeited: boolean;
  opponentForfeited: boolean;
  opponentInProgress: boolean;
  isDraw: boolean;
  resultTone: MatchResultTone;
}): string {
  if (currentForfeited) {
    return '기권으로 대결을 마쳤어요';
  }

  if (opponentForfeited) {
    return `${opponentName}님이 기권해서 승리했어요`;
  }

  if (opponentInProgress) {
    return `${opponentName}님보다 먼저 완주했어요`;
  }

  if (isDraw) {
    return `${opponentName}님과 비슷한 흐름으로 마쳤어요`;
  }

  return resultTone === 'win'
    ? `${opponentName}님을 이겼어요`
    : `${opponentName}님에게 졌어요`;
}

export function resolveDuelSummary({
  currentForfeited,
  opponentForfeited,
  opponentInProgress,
  isDraw,
  resultTone,
  currentDistanceKm,
  gapKm,
}: {
  currentForfeited: boolean;
  opponentForfeited: boolean;
  opponentInProgress: boolean;
  isDraw: boolean;
  resultTone: MatchResultTone;
  currentDistanceKm: number;
  gapKm: number;
}): string {
  if (currentForfeited) {
    return `내 기록은 ${currentDistanceKm.toFixed(2)}km로 저장되고, 대결 전적은 기권 패로 남아요.`;
  }

  if (opponentForfeited) {
    return `상대가 기권했고 내 기록은 ${currentDistanceKm.toFixed(2)}km로 저장돼요.`;
  }

  if (opponentInProgress) {
    return '상대가 완주하면 결과표가 자동으로 업데이트돼요.';
  }

  if (isDraw) {
    return `두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽으로 거의 비슷했어요.`;
  }

  return resultTone === 'win'
    ? `${gapKm.toFixed(2)}km 차이로 앞서 마무리했어요.`
    : `${gapKm.toFixed(2)}km 차이로 뒤에서 마무리했어요.`;
}

export function resolveDuelBadgeLabel({
  currentForfeited,
  opponentForfeited,
  isDraw,
  resultTone,
}: {
  currentForfeited: boolean;
  opponentForfeited: boolean;
  isDraw: boolean;
  resultTone: MatchResultTone;
}): string {
  if (currentForfeited) {
    return '기권 패';
  }

  if (opponentForfeited) {
    return '상대 기권 승';
  }

  if (isDraw) {
    return '무승부';
  }

  return resultTone === 'win' ? '승리' : '패배';
}

export function resolveDuelCurrentRowLabel({
  isDraw,
  resultTone,
}: {
  isDraw: boolean;
  resultTone: MatchResultTone;
}): DuelMatchResultRowLabel {
  if (isDraw) {
    return 'DRAW';
  }

  return resultTone === 'win' ? 'WIN' : 'LOSER';
}

export function resolveDuelOpponentRowLabels({
  opponentInProgress,
  isDraw,
  resultTone,
  opponentPaceLabel,
  opponentDurationLabel,
}: {
  opponentInProgress: boolean;
  isDraw: boolean;
  resultTone: MatchResultTone;
  opponentPaceLabel: string;
  opponentDurationLabel: string;
}): {
  resultLabel: DuelMatchResultRowLabel;
  paceLabel: string;
  durationLabel: string;
} {
  if (opponentInProgress) {
    return {
      resultLabel: 'ING',
      paceLabel: '진행 중',
      durationLabel: '-',
    };
  }

  return {
    resultLabel: isDraw
      ? 'DRAW'
      : resultTone === 'win'
        ? 'LOSER'
        : 'WIN',
    paceLabel: opponentPaceLabel,
    durationLabel: opponentDurationLabel,
  };
}

export function resolveDuelRowOrder({
  currentRow,
  opponentRow,
  opponentInProgress,
  isDraw,
}: {
  currentRow: DuelMatchResultRowModel;
  opponentRow: DuelMatchResultRowModel;
  opponentInProgress: boolean;
  isDraw: boolean;
}): DuelMatchResultRowModel[] {
  if (opponentInProgress || isDraw || currentRow.resultLabel === 'WIN') {
    return [currentRow, opponentRow];
  }

  return [opponentRow, currentRow];
}

export function resolveGroupTitle({
  currentForfeited,
  currentRank,
  participantCount,
}: {
  currentForfeited: boolean;
  currentRank: number;
  participantCount: number;
}): string {
  if (currentForfeited) {
    return '기권으로 그룹 대결을 마쳤어요';
  }

  return currentRank === 1
    ? '1위로 마무리했어요'
    : `${participantCount}명 중 ${currentRank}위로 마쳤어요`;
}

export function resolveGroupSummary({
  currentForfeited,
  currentRank,
  participantCount,
  gapAheadKm,
}: {
  currentForfeited: boolean;
  currentRank: number;
  participantCount: number;
  gapAheadKm?: number | null;
}): string {
  if (currentForfeited) {
    return `${participantCount}명 중 ${currentRank}위로 정리되고, 지금까지 측정한 기록은 저장돼요.`;
  }

  return currentRank === 1
    ? '마지막까지 페이스를 잘 지켜서 가장 먼저 들어왔어요.'
    : `앞 사람과 ${gapAheadKm?.toFixed(2) ?? '0.00'}km 차이였어요.`;
}

export function resolveGroupRowLabels({
  isInProgress,
  isCurrentUser,
  currentPaceLabel,
  participantPaceLabel,
  durationLabel,
}: {
  isInProgress: boolean;
  isCurrentUser: boolean;
  currentPaceLabel: string;
  participantPaceLabel: string;
  durationLabel: string;
}): {
  paceLabel: string;
  durationLabel: string;
  isInProgress: boolean;
} {
  return {
    paceLabel: isInProgress
      ? '진행 중'
      : isCurrentUser
        ? currentPaceLabel
        : participantPaceLabel,
    durationLabel: isInProgress ? '-' : durationLabel,
    isInProgress,
  };
}

export function resolveGroupStatusLabel({
  hasRows,
  hasOngoing,
}: {
  hasRows: boolean;
  hasOngoing: boolean;
}): string | null {
  if (!hasRows) {
    return null;
  }

  return hasOngoing
    ? '진행중 · 들어오는 대로 순위가 계속 업데이트돼요.'
    : '결과 확정 · 모든 참가자 기록이 정리됐어요.';
}
