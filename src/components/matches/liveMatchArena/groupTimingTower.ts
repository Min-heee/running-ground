import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
// helpers.ts가 아니라 여기서 직접 가져온다: helpers는 react-native(Platform)를 물고
// 있어 node 테스트 러너가 이 순수 모듈을 못 읽게 된다.
import { isRunnerForfeited } from '@/components/matches/liveMatchArenaVisualState';
import { resolveForfeitStatusLabel } from '@/features/runs/viewModels/matchForfeitLabels';

// 그룹로드 F1 타이밍 타워 모델 (오너 2026-08-05, F1 순위표 레퍼런스).
// 화면은 순위 · 색 띠 · 이름 · 앞줄과의 간격 한 줄씩이고, 순위가 바뀐 러너에게
// ▲▼를 몇 업데이트 동안 보여준다. 뷰가 얇도록 계산은 전부 여기서 한다.

// ▲▼ 수명은 벽시계 기준(적대 리뷰 2026-08-05): 업데이트 횟수만 세면 (a) 경기
// 종료 후 피드가 조용해질 때 마지막 화살표가 영영 남고 (b) 안드로이드 반올림으로
// 내용 동일 틱이 걸러지면 4초가 임의로 늘어난다. 업데이트 횟수 캡은 보조로 유지.
export const RANK_SHIFT_VISIBLE_MS = 4000;
export const RANK_SHIFT_VISIBLE_UPDATES = 4;

export type RankShiftDirection = 'up' | 'down';

export type RankShift = { direction: RankShiftDirection; age: number; bornAtMs: number };

export type RankShiftState = {
  rankById: Record<string, number>;
  shiftById: Record<string, RankShift>;
};

export function isRankShiftVisibleAt(shift: RankShift, nowMs: number): boolean {
  return nowMs - shift.bornAtMs < RANK_SHIFT_VISIBLE_MS;
}

export function createEmptyRankShiftState(): RankShiftState {
  return { rankById: {}, shiftById: {} };
}

// rankLabel("3위")에서 숫자만 뽑는다. 없으면 보이는 줄 순서로 대신한다 —
// 안드로이드 경량 모드에서 목록이 창(top3+내 주변)으로 잘려도 rankLabel은
// 상류에서 전체 기준으로 붙어 오므로 진짜 순위가 유지된다.
export function resolveRankNumber(participant: ArenaParticipant, index: number): number {
  const parsed = Number.parseInt(participant.rankLabel ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
}

// 참가자 데이터가 한 번 갱신될 때마다 호출해 순위 변동(▲▼)을 굴린다.
// 같은 방향으로 계속 바뀌어도 age는 리셋 — 연속 추월 중엔 화살표가 계속 산다.
export function advanceRankShiftState(
  state: RankShiftState,
  participants: ArenaParticipant[],
  nowMs: number,
): RankShiftState {
  const rankById: RankShiftState['rankById'] = {};
  const shiftById: RankShiftState['shiftById'] = {};

  participants.forEach((participant, index) => {
    const rank = resolveRankNumber(participant, index);
    rankById[participant.id] = rank;

    const previousRank = state.rankById[participant.id];
    if (typeof previousRank === 'number' && previousRank !== rank) {
      shiftById[participant.id] = {
        direction: rank < previousRank ? 'up' : 'down',
        age: 0,
        bornAtMs: nowMs,
      };
      return;
    }

    const carried = state.shiftById[participant.id];
    if (
      carried
      && carried.age + 1 < RANK_SHIFT_VISIBLE_UPDATES
      && isRankShiftVisibleAt(carried, nowMs)
    ) {
      shiftById[participant.id] = { ...carried, age: carried.age + 1 };
    }
  });

  return { rankById, shiftById };
}

// 간격 칸: 선두는 '선두', 그 외에는 바로 윗줄 러너와의 거리 차(+X.XXkm).
// 안드로이드 경량 모드에서 중간 순위가 접혀 있어도 "위에 보이는 줄과의 차이"라는
// 의미는 그대로 성립한다. 상태 우선순위: 기권 · 완주 · 측정 대기 · 선두 —
// 출발 직후 전원 대기일 때 첫 줄만 '선두'로 보이면 거짓말이라 대기가 선두를 이긴다.
export function buildGroupGapLabel(
  participant: ArenaParticipant,
  aheadParticipant: ArenaParticipant | null,
): string {
  if (isRunnerForfeited(participant)) {
    return resolveForfeitStatusLabel(participant.disqualified);
  }
  if (participant.liveStatus === 'finished') {
    return '완주';
  }
  if (participant.liveStatus === 'ready') {
    return '측정 대기';
  }
  if (!aheadParticipant) {
    return '선두';
  }

  const gapKm = Math.max(0, aheadParticipant.distanceKm - participant.distanceKm);
  return `+${gapKm.toFixed(2)}km`;
}
