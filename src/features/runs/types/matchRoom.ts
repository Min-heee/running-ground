import type { RunningMatchRoomStartMode } from '@/lib/api/types';

export type UpdateRoomSettingsInput = Partial<{
  distanceKm: number;
  maxParticipants: number;
  invitedFriendIds: string[];
  // 시작 방식 (오너 2026-09-09, 파티런 예약): 'scheduled'로 바꿀 때는 slotStartAt(정시 ISO)을
  // 같이 보낸다. 생략하면 방의 현재 값을 그대로 다시 보낸다 — 설정 저장이 예약을 조용히
  // 방장 시작으로 되돌리던 구멍을 막는다.
  startMode: RunningMatchRoomStartMode;
  slotStartAt: string;
}>;
