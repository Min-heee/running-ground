import type { RunningMatchRoom, UpdateRunningMatchRoomInput } from '@/lib/api/types';
import type { UpdateRoomSettingsInput } from '@/features/runs/types/matchRoom';

// 대기실 설정 저장 페이로드 (계약 C1, 오너 2026-09-09 파티런 예약).
// 서버는 매 저장마다 startMode/slotStartAt을 다시 받는다 — 그래서 거리 칩 하나를 눌러도 방의
// CURRENT 시작 방식을 그대로 실어 보내야 한다. 예전 코드는 여기서 'host'를 하드코딩해 예약
// 방을 조용히 방장 시작으로 되돌렸다(4f5ca3bd). 'scheduled'일 때만 slotStartAt을 보내고,
// 'host'면 아예 싣지 않는다(서버가 now로 채운다).
export function buildRoomSettingsPayload({
  room,
  overrides = {},
  selectedFriendIds,
}: {
  room: Pick<RunningMatchRoom, 'roomId' | 'mode' | 'distanceKm' | 'startMode' | 'slotStartAt' | 'maxParticipants'>;
  overrides?: UpdateRoomSettingsInput;
  selectedFriendIds: string[];
}): UpdateRunningMatchRoomInput {
  const startMode = overrides.startMode ?? room.startMode;
  const slotStartAt = startMode === 'scheduled'
    ? overrides.slotStartAt ?? room.slotStartAt
    : undefined;

  return {
    roomId: room.roomId,
    distanceKm: overrides.distanceKm ?? room.distanceKm,
    startMode,
    ...(slotStartAt ? { slotStartAt } : {}),
    maxParticipants: room.mode === 'group'
      ? overrides.maxParticipants ?? room.maxParticipants
      : 2,
    invitedFriendIds: overrides.invitedFriendIds ?? selectedFriendIds,
  };
}
