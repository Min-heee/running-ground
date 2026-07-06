export type UpdateRoomSettingsInput = Partial<{
  distanceKm: number;
  maxParticipants: number;
  invitedFriendIds: string[];
}>;
