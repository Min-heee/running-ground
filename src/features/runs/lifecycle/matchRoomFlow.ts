import type { FriendRank } from '@/domain';
import type {
  RunningMatchRoom,
  RunningMatchRoomInvitee,
  RunningMatchRoomParticipant,
} from '@/lib/api/types';
import {
  MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS,
  getMatchStartRemainingSeconds,
} from '@/lib/matchCountdown';
import { isReservedPartyRoomBeforeCountdown } from '@/features/runs/lifecycle/matchStateMachine';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';

// 파티런 예약 (오너 2026-09-09): 방장이 시간을 고르고 친구가 수락하면 서버가 바로 세션을
// 묶는다(linkedMatchId). 그 뒤 대기실은 슬롯 30초 전(카운트다운 창)에 '예약 완료' 배너를
// 카운트다운 배너로 바꾸고, 20초 전에 대결 화면으로 넘긴다 — 카피는 창 상수에서 뽑아 다시
// 어긋나지 않게 한다.
const RESERVATION_COUNTDOWN_HELPER_TEXT = `시작 ${MATCH_OVERLAY_COUNTDOWN_WINDOW_SECONDS}초 전에 자동으로 카운트다운이 시작돼요.`;
// 예약 방(시간이 정해진 방)의 게스트 '준비'는 '그 시간을 수락한다'는 뜻이다 — 게스트 전원이
// 수락하면 서버가 그 자리에서 예약(세션)을 만든다. 초대 수락으로 들어온 게스트는 이미 수락
// 상태로 들어오고, 시간이 정해지기 전에 들어와 있던 게스트만 이 버튼을 본다.
const SCHEDULED_ACCEPT_LABEL = '예약 수락';
const SCHEDULED_ACCEPTED_LABEL = '수락 취소';
const SCHEDULED_ACCEPT_HELPER_TEXT = '방장이 고른 시간에 달릴 수 있으면 예약 수락을 눌러 주세요. 모두 수락하면 예약이 확정돼요.';
const SCHEDULED_ACCEPTED_HELPER_TEXT = '예약 시간을 수락했어요. 모두 수락하면 예약이 확정돼요.';
const HOST_START_STAY_NOTICE = '방장이 시작하면 바로 카운트다운이 진행돼요 — 러닝스페이스 앱을 나가지 말고 기다려 주세요.';
const SCHEDULED_START_STAY_NOTICE = '예약 시간이 되면 자동으로 카운트다운이 진행돼요 — 시작 전에 러닝스페이스 앱을 켜 두세요.';

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
  | 'reserved'
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
    | 'reserved'
    | 'linked'
    | 'arming'
    | 'needs-participants'
    | 'needs-ready'
    | 'can-start';
  visible: boolean;
  label: string | null;
  canStart: boolean;
  helperText: string | null;
  enoughParticipants: boolean;
  allGuestsReady: boolean;
};

// 예약이 확정된(세션이 묶인) 미래 슬롯의 방. 카운트다운 창(30초)에 들어가면 기존 파티런
// 페이즈 기계(countdown → arenaHandoff)가 넘겨받으므로 isReserved는 그 전까지만 참이다.
export type MatchRoomReservationState = {
  isReserved: boolean;
  slotStartAt: string | null;
  slotLabel: string | null;
  title: string | null;
  helperText: string | null;
  // 예약 방의 나가기 버튼 라벨 — 라벨이 곧 동작이다(방장: 예약 취소, 1대1 게스트: 예약 취소,
  // 그룹 게스트: 예약에서 나가기). 예약이 아니면 null(화면이 기존 '방 삭제'/'방 나가기'를 쓴다).
  leaveLabel: string | null;
};

// 예약 방의 나가기/삭제 확인 문구. 되돌릴 수 없는 예약 취소를 라벨 없는 '방 삭제'/'방 나가기'로
// 눌러 버리던 구멍(적대 검증 2026-09-10). 예약이 아니면 null — 호출자가 기존 규칙을 쓴다.
export type MatchRoomLeavePrompt = {
  title: string;
  message: string;
  confirmLabel: string;
};

export function resolveReservedMatchRoomLeavePrompt(
  room: Pick<RunningMatchRoom, 'mode' | 'isHost' | 'slotStartAt' | 'linkedMatchSlotStartAt' | 'participants' | 'minParticipants'> | null | undefined,
  reserved: boolean,
): MatchRoomLeavePrompt | null {
  if (!room || !reserved) {
    return null;
  }

  const slotLabel = formatRoomDateLabel(room.linkedMatchSlotStartAt ?? room.slotStartAt);

  if (room.isHost) {
    return {
      title: '파티런 예약을 취소할까요?',
      message: room.mode === 'duel'
        ? `${slotLabel} 예약이 취소되고 상대에게 취소 알림이 가요. 대기방도 함께 사라져요.`
        : `${slotLabel} 예약이 취소되고 참가자 전원에게 취소 알림이 가요. 대기방도 함께 사라져요.`,
      confirmLabel: '예약 취소',
    };
  }

  // 그룹에서 내가 빠져도 최소 인원이 남으면 예약은 유지된다 — 그때는 '빠진다'고만 말한다.
  const remainsAfterLeave = room.mode === 'group' && room.participants.length - 1 >= room.minParticipants;

  if (remainsAfterLeave) {
    return {
      title: '예약에서 빠질까요?',
      message: `나가면 ${slotLabel} 파티런 예약에서 빠져요. 남은 참가자에게 알림이 가요.`,
      confirmLabel: '예약에서 나가기',
    };
  }

  return {
    title: '예약을 취소하고 나갈까요?',
    message: `나가면 ${slotLabel} 파티런 예약이 취소되고 방장에게 알림이 가요. 방장은 다른 친구를 다시 초대할 수 있어요.`,
    confirmLabel: '예약 취소',
  };
}

export type MatchRoomUxModel = {
  invite: MatchRoomInviteUxState;
  participants: MatchRoomParticipantUxRow[];
  readyAction: MatchRoomReadyActionState;
  startAction: MatchRoomHostStartActionState;
  reservation: MatchRoomReservationState;
  stayNotice: string;
};

export function isMatchRoomReservedForFuture(
  room: Pick<RunningMatchRoom, 'startMode' | 'linkedMatchId' | 'slotStartAt' | 'linkedMatchSlotStartAt'> & Partial<Pick<RunningMatchRoom, 'joined'>> | null | undefined,
  syncedNowMs: number,
) {
  // 초대만 받고 아직 수락하지 않은 사람에게는 '예약 완료'도 '예약 취소'도 내 것이 아니다.
  if (!room?.linkedMatchId || room.startMode !== 'scheduled' || room.joined === false) {
    return false;
  }

  // 페이즈 기계(derivePartyRunStartPhase)와 같은 판정 — 대기실 화면과 러닝 탭 런타임이 같은 순간에
  // '예약 완료'에서 카운트다운으로 넘어간다.
  return isReservedPartyRoomBeforeCountdown({
    startMode: room.startMode,
    linkedMatchId: room.linkedMatchId,
    remainingSeconds: getMatchStartRemainingSeconds(room.linkedMatchSlotStartAt ?? room.slotStartAt, syncedNowMs),
  });
}

export function buildMatchRoomReservationState(
  room: Pick<RunningMatchRoom, 'slotStartAt' | 'linkedMatchSlotStartAt' | 'mode' | 'isHost' | 'participants' | 'minParticipants'> | null | undefined,
  reserved: boolean,
): MatchRoomReservationState {
  if (!room || !reserved) {
    return {
      isReserved: false,
      slotStartAt: null,
      slotLabel: null,
      title: null,
      helperText: null,
      leaveLabel: null,
    };
  }

  const slotStartAt = room.linkedMatchSlotStartAt ?? room.slotStartAt;
  const slotLabel = formatRoomDateLabel(slotStartAt);

  return {
    isReserved: true,
    slotStartAt,
    slotLabel,
    title: `예약 완료 · ${slotLabel} 시작`,
    helperText: RESERVATION_COUNTDOWN_HELPER_TEXT,
    leaveLabel: resolveReservedMatchRoomLeavePrompt(room, true)?.confirmLabel ?? null,
  };
}

// 예약 전(링크 없음) 예약 방의 저장 슬롯이 이미 지났다 — 게스트의 수락도, 방장의 초대도 의미가
// 없고 방장이 새 시간을 골라야 한다. 대기실 화면과 카드가 같은 시계로 판정한다.
export function isMatchRoomScheduledSlotPassed(
  room: Pick<RunningMatchRoom, 'startMode' | 'linkedMatchId' | 'slotStartAt'> | null | undefined,
  syncedNowMs: number,
) {
  if (!room || room.startMode !== 'scheduled' || room.linkedMatchId) {
    return false;
  }

  const slotMs = Date.parse(room.slotStartAt);
  return !Number.isFinite(slotMs) || slotMs <= syncedNowMs;
}

// 대기실 상단 고정 안내. 방장 시작 방은 '앱을 나가지 말라', 예약 방은 '시간 맞춰 켜 두라'.
export function buildMatchRoomStayNotice(room: Pick<RunningMatchRoom, 'startMode'> | null | undefined) {
  return room?.startMode === 'scheduled' ? SCHEDULED_START_STAY_NOTICE : HOST_START_STAY_NOTICE;
}

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
  room: Pick<RunningMatchRoom, 'joined' | 'participants'> & Partial<Pick<RunningMatchRoom, 'startMode' | 'slotStartAt'>> | null | undefined,
  currentUserId: string,
): MatchRoomInviteUxState {
  const acceptance = buildMatchRoomInviteAcceptanceState(room, currentUserId);

  if (acceptance.canAccept) {
    // 예약 방의 수락은 그 시간을 수락하는 것 — 카드가 그렇게 말해야 한다.
    const scheduledSlotLabel = room?.startMode === 'scheduled' && room.slotStartAt
      ? formatRoomDateLabel(room.slotStartAt)
      : null;
    return {
      state: 'pending',
      isInvitedOnly: true,
      isAlreadyJoined: false,
      canAccept: true,
      canDecline: true,
      title: '파티런 초대가 왔어요',
      helperText: scheduledSlotLabel
        ? `수락하면 ${scheduledSlotLabel} 파티런 예약이 확정돼요. 거절하면 초대 카드가 사라져요.`
        : '수락하면 바로 대기실 참가자 명단에 들어가고, 거절하면 초대 카드가 사라져요.',
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

function buildParticipantStatus(
  room: Pick<RunningMatchRoom, 'linkedMatchId' | 'startMode'>,
  participant: RunningMatchRoomParticipant,
  reserved: boolean,
) {
  if (reserved) {
    // 그룹 예약은 최소 인원이 수락하는 순간 확정된다 — 그때 아직 수락 전이던(시간이 정해지기 전에
    // 들어온) 참가자는 '수락 대기'로 남고 대기실에서 수락하면 세션에 합류한다.
    return participant.isHost || participant.isReady
      ? { status: 'reserved' as const, label: '예약 확정' }
      : { status: 'waiting' as const, label: '수락 대기' };
  }

  if (room.linkedMatchId) {
    return participant.isCountdownReady
      ? { status: 'countdown-ready' as const, label: '로딩 완료' }
      : { status: 'countdown-loading' as const, label: '로딩 중' };
  }

  if (participant.isHost) {
    return { status: 'host' as const, label: room.startMode === 'scheduled' ? '방장' : '시작 권한' };
  }

  // 예약 방의 준비는 시간 수락이다 — 라벨도 그렇게 읽혀야 방장이 '왜 예약이 안 잡히지'를 안다.
  if (room.startMode === 'scheduled') {
    return participant.isReady
      ? { status: 'ready' as const, label: '수락 완료' }
      : { status: 'waiting' as const, label: '수락 대기' };
  }

  return participant.isReady
    ? { status: 'ready' as const, label: '준비 완료' }
    : { status: 'waiting' as const, label: '대기 중' };
}

export function buildMatchRoomParticipantUxRows(
  room: Pick<RunningMatchRoom, 'participants' | 'linkedMatchId' | 'startMode'> | null | undefined,
  pendingInvitees: RunningMatchRoomInvitee[] = [],
  reserved = false,
): MatchRoomParticipantUxRow[] {
  if (!room) {
    return [];
  }

  const participantRows = room.participants.map((participant, index) => {
    const status = buildParticipantStatus(room, participant, reserved);

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
  room: Pick<RunningMatchRoom, 'isHost' | 'linkedMatchId' | 'startMode'> | null | undefined,
  currentParticipant?: Pick<RunningMatchRoomParticipant, 'isReady'> | null,
  { scheduledSlotPassed = false, reserved = false }: { scheduledSlotPassed?: boolean; reserved?: boolean } = {},
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

  // 확정된 예약 방에서 아직 수락 전인 나 — 수락하면 예약(세션)에 합류한다. 수락 뒤에는 '나가기'만
  // 남는다(세션 인원은 되돌리지 않는다, 서버 updateRunningMatchRoomReady).
  if (room.linkedMatchId && reserved && room.startMode === 'scheduled') {
    if (currentParticipant && !currentParticipant.isReady) {
      return {
        state: 'not-ready',
        visible: true,
        label: SCHEDULED_ACCEPT_LABEL,
        canToggle: true,
        helperText: '예약이 이미 확정된 방이에요. 수락하면 이 예약에 합류해요.',
      };
    }

    return {
      state: 'locked',
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

  if (room.startMode === 'scheduled') {
    if (scheduledSlotPassed) {
      return {
        state: 'locked',
        visible: false,
        label: null,
        canToggle: false,
        helperText: '예약한 시간이 지났어요. 방장이 새 시간을 고르면 다시 수락할 수 있어요.',
      };
    }

    return {
      state: isReady ? 'ready' : 'not-ready',
      visible: true,
      label: isReady ? SCHEDULED_ACCEPTED_LABEL : SCHEDULED_ACCEPT_LABEL,
      canToggle: true,
      helperText: isReady ? SCHEDULED_ACCEPTED_HELPER_TEXT : SCHEDULED_ACCEPT_HELPER_TEXT,
    };
  }

  return {
    state: isReady ? 'ready' : 'not-ready',
    visible: true,
    label: isReady ? '준비 취소' : '준비',
    canToggle: true,
    helperText: isReady
      ? '준비 완료 상태예요. 방장이 시작하면 카운트다운이 시작돼요.'
      : '',
  };
}

export function buildMatchRoomHostStartActionState(
  room: Pick<RunningMatchRoom, 'startMode' | 'state' | 'isHost' | 'participants' | 'minParticipants' | 'canStart' | 'linkedMatchId'> | null | undefined,
  reserved = false,
  { scheduledSlotPassed = false }: { scheduledSlotPassed?: boolean } = {},
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

  // 예약 확정 방은 방장/참가자 모두 시작 버튼도 준비 버튼도 없다. 카운트다운 안내는 요약 카드의
  // 예약 배너가 맡으므로 여기서는 반복하지 않는다(같은 문장이 두 카드에 찍히던 것).
  if (room && reserved) {
    return {
      state: 'reserved',
      visible: false,
      label: null,
      canStart: false,
      helperText: null,
      enoughParticipants: room.participants.length >= room.minParticipants,
      allGuestsReady: areAllMatchRoomGuestsReady(room),
    };
  }

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
      // 인원은 찼는데 수락이 빠졌으면(시간이 정해지기 전에 들어온 게스트) 그걸 말해준다 —
      // 방장은 '왜 예약이 안 잡히지'가 아니라 '누가 아직 수락 전인지'를 봐야 한다. 저장 슬롯이
      // 지났으면 수락도 초대도 소용없다 — 새 시간을 고르라고 한다.
      helperText: scheduledSlotPassed
        ? '예약한 시간이 지났어요. 시작 시간 카드에서 다른 시간을 골라 주세요.'
        : !enoughParticipants
          // 인원부터 채워야 한다 — 그룹은 3명이라, 수락 얘기만 하면 방장이 왜 막혔는지 모른다.
          ? `최소 ${room.minParticipants}명이 모여야 예약이 확정돼요. 친구를 더 초대해 주세요.`
          : allGuestsReady
            ? `친구가 수락하면 예약이 확정돼요. ${RESERVATION_COUNTDOWN_HELPER_TEXT}`
            : `참가자가 예약 시간을 모두 수락하면 예약이 확정돼요. ${RESERVATION_COUNTDOWN_HELPER_TEXT}`,
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
  reserved = false,
  scheduledSlotPassed = false,
}: {
  room: RunningMatchRoom | null | undefined;
  currentUserId: string;
  pendingInvitees?: RunningMatchRoomInvitee[];
  // isMatchRoomReservedForFuture(room, syncedNowMs) — 호출자가 시계를 대고 판정해 넘긴다.
  reserved?: boolean;
  // isMatchRoomScheduledSlotPassed(room, syncedNowMs) — 예약 전 방의 저장 슬롯이 지났다.
  scheduledSlotPassed?: boolean;
}): MatchRoomUxModel {
  const currentParticipant = room?.participants.find((participant) => (
    participant.userId === currentUserId || participant.tag === currentUserId
  )) ?? null;

  return {
    invite: buildMatchRoomInviteUxState(room, currentUserId),
    participants: buildMatchRoomParticipantUxRows(room, pendingInvitees, reserved),
    readyAction: buildMatchRoomReadyActionState(room, currentParticipant, { scheduledSlotPassed, reserved }),
    startAction: buildMatchRoomHostStartActionState(room, reserved, { scheduledSlotPassed }),
    reservation: buildMatchRoomReservationState(room, reserved),
    stayNotice: buildMatchRoomStayNotice(room),
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
