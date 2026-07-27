import type { ChaseLiveParticipant, ChaseOverviewResponse } from '@/lib/api/types';

// 익명 러너 점을 지도 뷰의 참가자 형태로 변환 — 이름/신원 없이 점+방향만 그린다.
// 좌표 기반 키: 인덱스 키는 러너가 빠질 때 다른 점이 그 키를 물려받아 지도가 가짜 이동
// 경로를 그린다. 좌표 키는 매 폴마다 마커를 새로 그릴 뿐(슬라이드 없음).
export function toAnonymousParticipants(
  overview: ChaseOverviewResponse | null,
): ChaseLiveParticipant[] {
  if (!overview) {
    return [];
  }

  return overview.runners.map((runner, index) => ({
    userId: `anon-${runner.latitude.toFixed(5)}:${runner.longitude.toFixed(5)}:${index}`,
    name: '',
    latitude: runner.latitude,
    longitude: runner.longitude,
    headingDeg: runner.headingDeg,
    paceLabel: null,
    ageSeconds: runner.ageSeconds,
    isSelf: false,
  }));
}
