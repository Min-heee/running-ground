import type { FriendRank } from '@/domain';
import type {
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomParticipant,
} from '@/lib/api/types';

export type MatchRoomInviteAcceptanceState = {
  isInvitedOnly: boolean;
  isAlreadyJoined: boolean;
  canAccept: boolean;
  canDecline: boolean;
};

export type MatchRoomInviteUxState =
  | {
      state: 'none';
      isInvitedOnly: false;
      isAlreadyJoined: false;
      canAccept: false;
      canDecline: false;
      title: string;
      helperText: string;
    }
  | {
      state: 'pending';
      isInvitedOnly: true;
      isAlreadyJoined: false;
      canAccept: true;
      canDecline: true;
      title: string;
      helperText: string;
    }
  | {
      state: 'joined';
      isInvitedOnly: false;
      isAlreadyJoined: true;
      canAccept: false;
      canDecline: false;
      title: string;
      helperText: string;
    };

export type MatchRoomParticipantUxStatus =
  | 'host'
  | 'waiting'
  | 'ready'
  | 'countdown-loading'
  | 'countdown-ready'
  | 'invite-pending';

export type MatchRoomParticipantUxRow = {
  id: string;
  name: string;
  badgeLabel: string | null;
  status: MatchRoomParticipantUxStatus;
  statusLabel: string;
  isHost: boolean;
  isInvitee: boolean;
};

export type MatchRoomReadyActionState = {
  state: 'hidden' | 'not-ready' | 'ready' | 'locked';
  visible: boolean;
  label: string | null;
  canToggle: boolean;
  helperText: string | null;
};

export type MatchRoomHostStartActionState = {
  state:
    | 'hidden'
    | 'scheduled'
    | 'linked'
    | 'arming'
    | 'needs-participants'
    | 'needs-ready'
    | 'can-start';
  visible: boolean;
  label: string | null;
  canStart: boolean;
  helperText: string;
  enoughParticipants: boolean;
  allGuestsReady: boolean;
};

export type MatchRoomUxModel = {
  invite: MatchRoomInviteUxState;
  participants: MatchRoomParticipantUxRow[];
  readyAction: MatchRoomReadyActionState;
  startAction: MatchRoomHostStartActionState;
};

export function areAllMatchRoomGuestsReady(room: Pick<RunningMatchRoom, 'participants'> | null | undefined) {
  if (!room) {
    return false;
  }

  const guests = room.participants.filter((participant) => !participant.isHost);
  return guests.length > 0 && guests.every((participant) => participant.isReady);
}

export function canHostStartMatchRoom(
  room: Pick<RunningMatchRoom, 'startMode' | 'isHost' | 'participants' | 'minParticipants' | 'canStart' | 'linkedMatchId'> | null | undefined,
) {
  if (!room) {
    return false;
  }

  return (
    room.startMode === 'host'
    && room.isHost
    && !room.linkedMatchId
    && room.canStart
    && room.participants.length >= room.minParticipants
    && areAllMatchRoomGuestsReady(room)
  );
}

export function buildMatchRoomInviteAcceptanceState(
  room: Pick<RunningMatchRoom, 'joined' | 'participants'> | null | undefined,
  currentUserId: string,
): MatchRoomInviteAcceptanceState {
  const isAlreadyJoined = Boolean(
    room?.participants.some((participant) => participant.userId === currentUserId || participant.tag === currentUserId),
  );
  const isInvitedOnly = Boolean(room && room.joined === false);

  return {
    isInvitedOnly,
    isAlreadyJoined,
    canAccept: isInvitedOnly && !isAlreadyJoined,
    canDecline: isInvitedOnly && !isAlreadyJoined,
  };
}

export function buildMatchRoomInviteUxState(
  room: Pick<RunningMatchRoom, 'joined' | 'participants'> | null | undefined,
  currentUserId: string,
): MatchRoomInviteUxState {
  const acceptance = buildMatchRoomInviteAcceptanceState(room, currentUserId);

  if (acceptance.canAccept) {
    return {
      state: 'pending',
      isInvitedOnly: true,
      isAlreadyJoined: false,
      canAccept: true,
      canDecline: true,
      title: '파티런 초대가 왔어요',
      helperText: '수락하면 바로 대기실 참가자 명단에 들어가고, 거절하면 초대 카드가 사라져요.',
    };
  }

  if (acceptance.isAlreadyJoined) {
    return {
      state: 'joined',
      isInvitedOnly: false,
      isAlreadyJoined: true,
      canAccept: false,
      canDecline: false,
      title: '파티런 참가 중',
      helperText: '이미 이 방 참가자 명단에 들어가 있어요.',
    };
  }

  return {
    state: 'none',
    isInvitedOnly: false,
    isAlreadyJoined: false,
    canAccept: false,
    canDecline: false,
    title: '초대 없음',
    helperText: '현재 처리할 초대가 없어요.',
  };
}

function buildParticipantStatus(room: Pick<RunningMatchRoom, 'linkedMatchId'>, participant: RunningMatchRoomParticipant) {
  if (room.linkedMatchId) {
    return participant.isCountdownReady
      ? { status: 'countdown-ready' as const, label: '로딩 완료' }
      : { status: 'countdown-loading' as const, label: '로딩 중' };
  }

  if (participant.isHost) {
    return { status: 'host' as const, label: '시작 권한' };
  }

  return participant.isReady
    ? { status: 'ready' as const, label: '준비 완료' }
    : { status: 'waiting' as const, label: '대기 중' };
}

export function buildMatchRoomParticipantUxRows(
  room: Pick<RunningMatchRoom, 'participants' | 'linkedMatchId'> | null | undefined,
  pendingInvitees: RunningMatchRoomInvitee[] = [],
): MatchRoomParticipantUxRow[] {
  if (!room) {
    return [];
  }

  const participantRows = room.participants.map((participant, index) => {
    const status = buildParticipantStatus(room, participant);

    return {
      id: `${participant.userId}-${index}`,
      name: participant.name,
      badgeLabel: participant.isHost ? '방장' : null,
      status: status.status,
      statusLabel: status.label,
      isHost: participant.isHost,
      isInvitee: false,
    };
  });

  const inviteeRows = pendingInvitees.map((invitee) => ({
    id: `invitee-${invitee.userId}`,
    name: invitee.name,
    badgeLabel: '초대됨',
    status: 'invite-pending' as const,
    statusLabel: '수락 대기중',
    isHost: false,
    isInvitee: true,
  }));

  return [...participantRows, ...inviteeRows];
}

export function buildMatchRoomReadyActionState(
  room: Pick<RunningMatchRoom, 'isHost' | 'linkedMatchId'> | null | undefined,
  currentParticipant?: Pick<RunningMatchRoomParticipant, 'isReady'> | null,
): MatchRoomReadyActionState {
  if (!room || room.isHost) {
    return {
      state: 'hidden',
      visible: false,
      label: null,
      canToggle: false,
      helperText: null,
    };
  }

  if (room.linkedMatchId) {
    return {
      state: 'locked',
      visible: false,
      label: null,
      canToggle: false,
      helperText: '대결이 시작 준비 중이라 준비 상태를 바꿀 수 없어요.',
    };
  }

  const isReady = Boolean(currentParticipant?.isReady);
  return {
    state: isReady ? 'ready' : 'not-ready',
    visible: true,
    label: isReady ? '준비 취소' : '준비',
    canToggle: true,
    helperText: isReady
      ? '준비 완료 상태예요. 방장이 시작하면 카운트다운이 시작돼요.'
      : '준비를 누르면 방장이 시작할 수 있는 조건에 포함돼요.',
  };
}

export function buildMatchRoomHostStartActionState(
  room: Pick<RunningMatchRoom, 'startMode' | 'state' | 'isHost' | 'participants' | 'minParticipants' | 'canStart' | 'linkedMatchId'> | null | undefined,
): MatchRoomHostStartActionState {
  const hidden = (state: MatchRoomHostStartActionState['state'], helperText: string): MatchRoomHostStartActionState => ({
    state,
    visible: false,
    label: null,
    canStart: false,
    helperText,
    enoughParticipants: false,
    allGuestsReady: false,
  });

  if (!room || !room.isHost) {
    return hidden('hidden', '방장만 시작할 수 있어요.');
  }

  const enoughParticipants = room.participants.length >= room.minParticipants;
  const allGuestsReady = areAllMatchRoomGuestsReady(room);

  if (room.linkedMatchId) {
    return {
      state: room.state === 'arming' ? 'arming' : 'linked',
      visible: false,
      label: null,
      canStart: false,
      helperText: room.state === 'arming'
        ? '모든 기기가 카운트다운 준비를 마치면 함께 시작 카운트다운이 보여요.'
        : '카운트다운이 시작되면 자동으로 대결 화면으로 이동해요.',
      enoughParticipants,
      allGuestsReady,
    };
  }

  if (room.startMode === 'scheduled') {
    return {
      state: 'scheduled',
      visible: false,
      label: null,
      canStart: false,
      helperText: '예약 시간 30초 전에 카운트다운이 시작돼요.',
      enoughParticipants,
      allGuestsReady,
    };
  }

  if (!enoughParticipants) {
    return {
      state: 'needs-participants',
      visible: true,
      label: '시작',
      canStart: false,
      helperText: `최소 ${room.minParticipants}명은 모여야 시작할 수 있어요.`,
      enoughParticipants,
      allGuestsReady,
    };
  }

  if (!allGuestsReady) {
    return {
      state: 'needs-ready',
      visible: true,
      label: '시작',
      canStart: false,
      helperText: '모든 참가자가 준비 완료해야 시작할 수 있어요.',
      enoughParticipants,
      allGuestsReady,
    };
  }

  return {
    state: 'can-start',
    visible: true,
    label: '시작',
    canStart: Boolean(room.canStart),
    helperText: room.canStart
      ? '모든 준비가 끝났어요. 시작하면 30초 카운트다운으로 들어가요.'
      : '서버 시작 가능 상태를 확인하는 중이에요.',
    enoughParticipants,
    allGuestsReady,
  };
}

export function buildMatchRoomUxModel({
  room,
  currentUserId,
  pendingInvitees = [],
}: {
  room: RunningMatchRoom | null | undefined;
  currentUserId: string;
  pendingInvitees?: RunningMatchRoomInvitee[];
}): MatchRoomUxModel {
  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserId || participant.tag === currentUserId
  )) ?? null;

  return {
    invite: buildMatchRoomInviteUxState(room, currentUserId),
    participants: buildMatchRoomParticipantUxRows(room, pendingInvitees),
    readyAction: buildMatchRoomReadyActionState(room, currentParticipant),
    startAction: buildMatchRoomHostStartActionState(room),
  };
}

export function buildPendingMatchRoomInvitees(
  room: Pick<RunningMatchRoom, 'participants' | 'invitedFriendIds' | 'invitedFriends'> | null | undefined,
  friendRanks: FriendRank[] = [],
): RunningMatchRoomInvitee[] {
  if (!room) {
    return [];
  }

  const joinedIds = new Set(room.participants.map((participant) => participant.userId));
  const serverInvitees = room.invitedFriends ?? [];
  const serverInviteeIds = new Set(serverInvitees.map((invitee) => invitee.userId));
  const fallbackInvitees = room.invitedFriendIds
    .filter((friendId) => !joinedIds.has(friendId) && !serverInviteeIds.has(friendId))
    .map((friendId) => {
      const friend = friendRanks.find((rank) => rank.id === friendId);

      return {
        userId: friendId,
        name: friend?.name ?? '초대한 친구',
        tag: friend?.tag,
        districtName: friend?.liveLocationLabel ?? '친구',
        averagePace: '페이스 준비 중',
        levelLabel: '',
        status: 'pending' as const,
      };
    });

  return [
    ...serverInvitees.filter((invitee) => !joinedIds.has(invitee.userId)),
    ...fallbackInvitees,
  ];
}
