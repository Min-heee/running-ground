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
  selfFinished,
}: {
  source: MatchExitActionSource | null;
  isTestMatch: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  isRunning: boolean;
  counterpartForfeited: boolean;
  selfFinished: boolean;
}): MatchExitActionState {
  if (!source) {
    return { kind: 'hidden' };
  }

  if (isTestMatch) {
    return {
      kind: 'test-exit',
      title: '테스트 대결을 여기서 끝낼 수 있어요',
      body: '테스트 상대 표시는 정리하고, 지금 러닝 기록은 혼자 계속 이어갈게요.',
      buttonLabel: isLeaving ? '정리 중...' : '테스트 대결 그만',
      disabled: isLeaving,
    };
  }

  if (selfFinished) {
    const disabled = isLeaving || isSaving || !isRunning;

    return {
      kind: 'self-finished',
      title: '완주했어요!',
      body: '상대가 완주하면 결과 화면에서 자동으로 알려드릴게요. 러닝을 종료하면 지금까지 기록이 저장돼요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : !isRunning
          ? '결과 화면 준비 중...'
          : '러닝 종료하고 결과보기',
      disabled,
    };
  }

  if (counterpartForfeited) {
    const disabled = isLeaving || isSaving || !isRunning;

    return {
      kind: 'counterpart-forfeited',
      title: '상대가 기권했어요',
      body: '내가 승리한 상태예요. 러닝을 종료하면 결과 화면에서 대결 결과를 확인할 수 있어요.',
      buttonLabel: isLeaving || isSaving
        ? '결과 저장 중...'
        : !isRunning
          ? '결과 화면 준비 중...'
          : '러닝 종료하고 결과보기',
      disabled,
    };
  }

  return {
    kind: 'forfeit',
    title: '대결을 기권할 수 있어요',
    body: '기권하면 내 동그라미가 기권 상태로 표시되고, 지금까지 측정한 기록을 저장한 뒤 나가요.',
    buttonLabel: isLeaving ? '기권 처리 중...' : '기권하기',
    disabled: isLeaving,
  };
}
