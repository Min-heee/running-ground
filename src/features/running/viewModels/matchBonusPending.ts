import type { RunMatchResult } from '@/domain/match';

// 2026-08-11 6km 테스트런: 그룹 레이스에서 꼴찌가 아닌 모든 완주자는 저장 직후 판정이 아직
// PENDING이라 결과 화면 포인트 카드에 "그룹 대결 포인트 +0P"가 찍힌다(파생 회계는 판정 확정
// 후 자동 치유되지만 화면은 그 순간의 스냅샷). 815런처럼 인원이 많을수록 전원이 이 화면을
// 보게 되므로, 미확정 창에서는 +0P 대신 '집계 중'으로 표기한다.
//
// PENDING 판별은 판정의 존재 자체로 한다: 듀얼은 resultTone, 그룹은 rank가 확정의 표식이다.
// 영구 미확정으로 닫힌 기록(terminal 오버레이, §3-⑦)은 진짜 0P이므로 호출부가 terminal을
// 넘겨 제외한다.
export function isMatchBonusPending(
  matchResult: Pick<RunMatchResult, 'mode' | 'resultTone' | 'rank'> | null,
  isTerminal: boolean,
): boolean {
  if (!matchResult || isTerminal) {
    return false;
  }

  if (matchResult.mode === 'duel') {
    return !matchResult.resultTone;
  }

  return !(typeof matchResult.rank === 'number' && matchResult.rank >= 1);
}
