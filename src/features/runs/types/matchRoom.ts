import type { RunningMatchRoomStartMode } from '@/lib/api/types';

export type MatchRoomMeridiem = '오전' | '오후';

export type UpdateRoomSettingsInput = Partial<{
  distanceKm: number;
  startMode: RunningMatchRoomStartMode;
  slotStartAt: string;
  maxParticipants: number;
  invitedFriendIds: string[];
}>;
