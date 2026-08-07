// 화면 꺼진 완주의 기록 저장 페이로드 (오너 2026-08-07 네이티브 업로더 확장).
//
// 골 크로싱 순간엔 JS가 잠깐 깨어 있다(그 틱이 크로싱을 계산했으니까) — 그 순간에
// 정식 저장 조립기(buildRunSaveResultSnapshot + 골 프리즈 클램프)를 그대로 돌려
// /runs/tracked 페이로드를 완성하고, 네이티브 배달원(armRunSaveUpload)에 맡긴다.
// 네이티브는 아무 것도 재계산하지 않는다 — 여기서 만든 몸통 그대로 재시도 배달만.
//
// 화면 켠 뒤의 일반 JS 저장과 겹쳐도 서버 (userId, startedAt) dedupe가 이중 기록을
// 막고, 케이던스(걸음 수)는 이 경로에선 알 수 없어 비워둔다 — 이후 JS 저장이
// 업그레이드하지 않는 값이라 화면-꺼짐 저장 기록은 케이던스 '--'로 남는다(수용).

import type { RunMatchSource, RunRoutePoint } from '@/domain';
import type { CreateTrackedRunInput } from '@/lib/api/types/runs';
import { applyGoalFreezeToDisplayedSnapshot } from '@/features/runs/hooks/runSaveFlow/goalFreezeClamp';
import { buildRunSaveResultSnapshot } from '@/features/runs/hooks/runSaveFlow/runSaveResultMapper';

export type ScreenOffRunSaveParams = {
  route: RunRoutePoint[];
  startedAt: string | null;
  elevationGainM: number;
  finishDistanceKm: number;
  finishElapsedSeconds: number;
  finishPace: string;
  crossedAtIso: string;
  matchId: string;
  mode: 'duel' | 'group';
  matchSource?: RunMatchSource;
};

// 완성된 CreateTrackedRunInput, 조립 불가(경로 부족 등)면 null — 그 경우 네이티브 배달도
// 대기열 영속도 생략하고 기존 흐름(앱 열면 JS 저장)만 남는다.
export function buildScreenOffRunSaveInput(params: ScreenOffRunSaveParams): CreateTrackedRunInput | null {
  try {
    const displayedSnapshot = {
      route: params.route,
      distanceKm: params.finishDistanceKm,
      elevationGainM: params.elevationGainM,
      currentPace: params.finishPace,
      elapsedSeconds: params.finishElapsedSeconds,
      startedAt: params.startedAt,
    };

    // 정식 저장과 같은 클램프: 크로싱 이후 표류 제거 + 경로를 크로싱 시각에서 절단.
    const clamped = applyGoalFreezeToDisplayedSnapshot(displayedSnapshot, {
      matchId: params.matchId,
      elapsedSeconds: params.finishElapsedSeconds,
      distanceKm: params.finishDistanceKm,
      pace: params.finishPace,
      crossedAtIso: params.crossedAtIso,
    });

    const saveSnapshot = buildRunSaveResultSnapshot({
      displayedSnapshot: clamped,
      // FIX-A 경로 재사용: matchId + mode만으로 PENDING 블롭 합성 — 서버 리졸버가
      // 공식 판정으로 업그레이드한다 (클라 판정은 어차피 신뢰되지 않음).
      fallbackMatchMode: params.mode,
      matchId: params.matchId,
      matchSource: params.matchSource,
      // 걸음 수는 이 경로에서 알 수 없다 → 케이던스 null 저장.
      totalSteps: 0,
      trackedMatchResult: null,
    });

    return saveSnapshot.createRunInput;
  } catch {
    // 경로<2점, 페이스 미계산 등 조립 불가 — 네이티브 배달 생략 (기존 흐름 유지).
    return null;
  }
}

// 네이티브 배달원에 넘길 JSON 문자열 형태.
export function buildScreenOffRunSaveJson(params: ScreenOffRunSaveParams): string | null {
  const input = buildScreenOffRunSaveInput(params);
  return input ? JSON.stringify(input) : null;
}
