import type { MyRunRecord } from '@/domain';

// 기록 행 오른쪽 끝에 한 마디로 찍히는 결과 (오너 2026-09-14, 기록 탭 개편).
// 칩도 배경도 없이 색 있는 글자 하나 — 혼자 뛴 러닝은 여기가 비어서, 아이콘 없이
// 밀도만으로 '겨룬 러닝 / 혼자 뛴 러닝'이 갈린다.

export type RunOutcomeTone = 'win' | 'lose' | 'draw' | 'rank' | 'top' | 'pending';

export type RunOutcome = {
  label: string;
  tone: RunOutcomeTone;
};

export function getRunOutcome(run: Pick<MyRunRecord, 'matchResult'>): RunOutcome | null {
  const matchResult = run.matchResult;

  if (!matchResult) {
    return null;
  }

  // 실격은 반드시 순위·승패보다 먼저 본다. 그룹 실격 블롭에는 rank가 같이 박혀 있어서
  // (buildCurrentUserForfeitMatchResult) 순서를 바꾸면 실격이 순위로 둔갑한다.
  if (matchResult.disqualified) {
    return { label: '실격', tone: 'lose' };
  }

  if (matchResult.mode === 'group') {
    const rank = matchResult.rank;

    // 그룹 PENDING은 서버가 rank를 지운다(matchResultBuilders).
    if (typeof rank !== 'number' || !Number.isFinite(rank)) {
      return { label: '집계 중', tone: 'pending' };
    }

    // 인원 가드 필수: 혼자 남아 기권한 그룹 러닝은 서버가 participantCount 1 / rank 1을
    // 박기 때문에, 가드가 없으면 그 기록이 보라색 '1위'로 축하받는다.
    if (rank === 1 && (matchResult.participantCount ?? 0) >= 2) {
      return { label: '1위', tone: 'top' };
    }

    return { label: `${rank}위`, tone: 'rank' };
  }

  switch (matchResult.resultTone) {
    case 'win':
      return { label: '승', tone: 'win' };
    case 'lose':
      return { label: '패', tone: 'lose' };
    case 'draw':
      return { label: '무', tone: 'draw' };
    default:
      // 듀얼 PENDING은 서버가 resultTone을 벗겨서 내려준다.
      return { label: '집계 중', tone: 'pending' };
  }
}
