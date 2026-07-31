// 홈 랭크 카드의 1대1 전적 줄 (오너 2026-08-01: "12승 8패 · 승률 60%").
//
// 1대1만 세는 이유: resultTone(승/패/무)은 1대1 판정 전용이고 그룹 대결은 순위만 있다 —
// 그룹 2위(포디움)를 '패'로 세면 승률이 억울하게 깎인다. 그룹 상세는 전적 화면 몫.

import type { MyRunRecord } from '@/domain';

export type DuelRecordSummary = {
  wins: number;
  losses: number;
  draws: number;
  // 승률(%) = 승 ÷ (승+패), 반올림. 무승부는 분모에서 뺀다. 승패가 없으면 0 —
  // 카드는 전적이 비어도 '1대1 0승 0패 · 승률 0%'로 보여준다 (오너 2026-08-01).
  winRatePercent: number;
};

export function buildDuelRecordSummary(
  runs: readonly MyRunRecord[] | null | undefined,
): DuelRecordSummary {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.matchResult?.mode !== 'duel') {
      continue;
    }

    if (run.matchResult.resultTone === 'win') {
      wins += 1;
    } else if (run.matchResult.resultTone === 'lose') {
      losses += 1;
    } else if (run.matchResult.resultTone === 'draw') {
      draws += 1;
    }
    // resultTone 없는 1대1(집계 중 pending)은 아직 전적이 아니다 — 세지 않는다.
  }

  const decided = wins + losses;

  return {
    wins,
    losses,
    draws,
    winRatePercent: decided > 0 ? Math.round((wins / decided) * 100) : 0,
  };
}

// 카드에 그대로 얹는 한 줄. 전적이 비어도 0으로 보여준다.
export function formatDuelRecordLine(summary: DuelRecordSummary): string {
  const { wins, losses, draws } = summary;
  const drawPart = draws > 0 ? ` ${draws}무` : '';
  return `1대1 ${wins}승 ${losses}패${drawPart}`;
}
