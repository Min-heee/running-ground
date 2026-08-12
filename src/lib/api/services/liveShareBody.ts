import type { UpdateRunningLiveShareInput } from '@/lib/api/types';

// 라이브 공유 PATCH body 조립 — 순수 함수로 분리해 테스트로 박제한다.
//
// 2026-08-12 근치: 8/1 출시 이후 이 body가 enabled/status/locationLabel 세 필드만 담고
// 위도·경도·거리·페이스·응원허용을 전부 버려서, 하트비트는 25초마다 멀쩡히 가는데(친구
// 목록 라이브 표시·음성 응원은 정상) 뷰어 지도는 영원히 "친구의 위치를 기다리는 중"이었다.
// 서버 핸들러(meNotificationRoutes.handlePatchMyLiveSharing)는 처음부터 전 필드를 받게
// 구현돼 있었다 — 전송부 한 곳이 빠뜨린 "동시수정 4곳" 사고. 이 함수와 테스트가 그 재발
// 방지 걸쇠다.
export function buildLiveSharePatchBody(input: UpdateRunningLiveShareInput): Record<string, unknown> {
  return {
    enabled: input.enabled,
    status: input.status,
    locationLabel: input.locationLabel?.trim() ?? '',
    // 좌표는 쌍으로만 의미가 있다 — 한쪽만 오면 지도에 반쪽 점이 찍히느니 버린다.
    ...(typeof input.latitude === 'number' && typeof input.longitude === 'number'
      ? { latitude: input.latitude, longitude: input.longitude }
      : {}),
    ...(typeof input.distanceKm === 'number' ? { distanceKm: input.distanceKm } : {}),
    ...(input.paceLabel ? { paceLabel: input.paceLabel } : {}),
    ...(typeof input.allowCheers === 'boolean' ? { allowCheers: input.allowCheers } : {}),
  };
}
