export type MatchExitActionSource = 'duel' | 'group';

export type MatchExitActionState =
  | { kind: 'hidden' }
  | {
      kind: 'test-exit';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    }
  | {
      kind: 'counterpart-forfeited';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    }
  | {
      kind: 'sole-survivor';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    }
  | {
      kind: 'self-forfeited';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    }
  | {
      kind: 'self-finished';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    }
  | {
      kind: 'forfeit';
      title: string;
      body: string;
      buttonLabel: string;
      disabled: boolean;
    };

export function buildMatchExitActionState({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  selfForfeited,
  selfFinished,
  allOthersForfeited = false,
}: {
  source: MatchExitActionSource | null;
  isTestMatch: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  isRunning: boolean;
  counterpartForfeited: boolean;
  selfForfeited: boolean;
  selfFinished: boolean;
  allOthersForfeited?: boolean;
}): MatchExitActionState {
  if (!source) {
    return { kind: 'hidden' };
  }

  if (isTestMatch) {
    return {
      kind: 'test-exit',
      title: '테스트 대결을 여기서 끝낼 수 있어요',
      body: '테스트 상대 표시는 정리하고, 지금 러닝 기록은 그대로 유지할게요.',
      buttonLabel: isLeaving ? '정리 중...' : '테스트 대결 그만',
      disabled: isLeaving,
    };
  }

  if (selfForfeited) {
    const disabled = isLeaving || isSaving;

    return {
      kind: 'self-forfeited',
      title: '기권 처리됐어요',
      body: '대결 결과는 기권으로 반영됐어요. 지금까지 기록을 저장하고 결과 화면으로 이동해요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : '결과보기',
      disabled,
    };
  }

  if (selfFinished) {
    // C-4 — do NOT gate on !isRunning: after a FAILED save the tracker is 'paused'
    // (isRunning=false, isSaving=false), and the old `|| !isRunning` disable left a dead
    // '결과 화면 준비 중...' card with no way to retry (H2). Idle here now means the save is
    // not in flight → offer an actionable retry.
    const disabled = isLeaving || isSaving;

    return {
      kind: 'self-finished',
      title: '완주했어요!',
      body: '상대가 완주하면 결과 화면에서 자동으로 알려드릴게요. 러닝을 종료하면 지금까지 기록이 저장돼요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : !isRunning
          ? '결과 다시 저장하기'
          : '러닝 종료하고 결과보기',
      disabled,
    };
  }

  if (counterpartForfeited) {
    const disabled = isLeaving || isSaving;

    return {
      kind: 'counterpart-forfeited',
      title: '상대가 기권했어요',
      body: '내가 승리한 상태예요. 러닝을 종료하면 결과 화면에서 대결 결과를 확인할 수 있어요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : '대결종료',
      disabled,
    };
  }

  // Group sole-survivor: I'm still active but everyone else has left the race
  // (forfeited / finished / disconnected). Reaching here means I'm NOT
  // forfeited/finished (those return above) and the counterpart-forfeited duel
  // case didn't apply. Offer a finish action that ends WITHOUT marking me as
  // forfeited — the button must call the non-forfeit show-result handler.
  if (source === 'group' && allOthersForfeited) {
    const disabled = isLeaving || isSaving;

    return {
      kind: 'sole-survivor',
      title: '혼자 남았어요',
      body: '다른 참가자가 모두 기권했어요. 종료하면 결과 화면에서 기록을 확인할 수 있어요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : '대결 종료',
      disabled,
    };
  }

  return {
    kind: 'forfeit',
    title: '대결을 기권할 수 있어요',
    body: '기권하면 대결과 측정이 즉시 종료되고 지금까지 기록을 저장해요.',
    buttonLabel: isLeaving ? '기권 처리 중...' : '기권하기',
    disabled: isLeaving,
  };
}
