// Group party-run rooms (그룹대결) must hold more than two runners. The create
// form's `roomMaxParticipants` state is shared and can be overwritten by
// useMatchRoomSelectionSync with a *duel* room's value of "2". If that stale "2"
// leaks into a group create, the backend caps the new group room at two and the
// third runner is rejected with "이 방은 이미 정원이 다 찼어.". This helper makes
// the group create payload self-correcting: it never sends a value below the
// group minimum and falls back to a sensible default when the state is unusable.
export const CREATE_ROOM_GROUP_MIN_PARTICIPANTS = 3;
export const CREATE_ROOM_GROUP_MAX_PARTICIPANTS = 30;
export const CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS = 10;

export function resolveCreateRoomMaxParticipants(
  mode: 'duel' | 'group',
  rawValue: string,
): number | undefined {
  if (mode !== 'group') {
    // Duel rooms always seat exactly two; the backend ignores any client value.
    return undefined;
  }

  const parsedValue = Math.round(Number(rawValue));
  if (!Number.isFinite(parsedValue) || parsedValue < CREATE_ROOM_GROUP_MIN_PARTICIPANTS) {
    return CREATE_ROOM_GROUP_DEFAULT_PARTICIPANTS;
  }

  return Math.min(CREATE_ROOM_GROUP_MAX_PARTICIPANTS, parsedValue);
}
