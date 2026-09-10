import { logBackendInfo } from '../../response/httpResponse.mjs';
import {
  buildLiveRunShareLockMessage,
  buildSingleMatchLockMessage,
} from '../matchFormatting.mjs';
import { formatDuelSlotLabel as formatDuelSlotLabelFromDateTime } from '../dateTimeFormatting.mjs';
import {
  buildMatchRoomInviteLink,
  buildOfficialStandingFields,
  areAllRunningMatchRoomGuestsReady,
  isParticipantDoneWithMatch,
  shouldClearLiveRunShareEntry,
} from '../matchPureHelpers.mjs';
import { findAnyQueuedMatchEntryForUser } from '../matchQueueStoreHelpers.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  findAnyReservedMatchSessionForUser,
  hydrateMatchSessionState,
} from '../runningMatchSessionStoreHelpers.mjs';
import { findUserById } from '../userStoreHelpers.mjs';
import {
  getMatchRoomLinkedSession,
  getRunningMatchRoomState,
} from './matchRoomCore.mjs';
import { findRunningMatchRoomJoinedByUser } from './matchRoomSync.mjs';
import {
  buildMatchRoomSlotLabel,
  isPendingScheduledPartySession,
} from './matchRoomReservation.mjs';

function buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId = null) {
  const user = findUserById(store, participant.userId);
  const runner = buildMatchRunnerProfile(store, user);
  const linkedParticipantFields = linkedParticipantFieldsByUserId?.get(participant.userId) ?? null;

  return {
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    ...(linkedParticipantFields ?? {}),
    isHost: Boolean(participant.isHost),
    isReady: Boolean(participant.isReady),
    isCountdownReady: Boolean(participant.isCountdownReady),
    invited: Boolean(participant.invited),
    joinedAt: participant.joinedAt,
  };
}

function buildRunningMatchRoomInviteePayload(store, room, userId, invitedAt) {
  const user = findUserById(store, userId);
  const runner = buildMatchRunnerProfile(store, user);

  return {
    inviteId: `${room.id}:${runner.id}`,
    roomId: room.id,
    inviteToken: room.inviteToken,
    invitedUserId: runner.id,
    userId: runner.id,
    name: runner.name,
    tag: runner.tag,
    districtName: runner.districtName,
    averagePace: runner.averagePace,
    levelLabel: runner.levelLabel,
    status: 'pending',
    ...(invitedAt ? { invitedAt } : {}),
  };
}

export function buildRunningMatchRoomResponse(store, currentUser, room, now = new Date()) {
  if (!room) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  const hostUser = findUserById(store, room.hostUserId);
  const linkedSession = getMatchRoomLinkedSession(room, store);
  const linkedMatchState = linkedSession ? hydrateMatchSessionState(linkedSession, now) : null;
  // The shared session can hydrate 'active' from the host's warm-up BEFORE this room's slot;
  // the room-facing linkedMatchStatus must only report 'active' once the slot has passed, or
  // the guest's phase skips the countdown (mirrors the getRunningMatchRoomState slot gate).
  const linkedMatchSlotStartAt = linkedSession?.slotStartAt ?? room.slotStartAt;
  const linkedMatchSlotPassed = linkedMatchSlotStartAt
    ? new Date(linkedMatchSlotStartAt).getTime() <= now.getTime()
    : false;
  const linkedOfficialByUserId = linkedSession
    ? new Map(buildOfficialSessionStandings(store, linkedSession, now).map((standing) => [standing.userId, standing]))
    : null;
  const linkedParticipantFieldsByUserId = linkedSession
    ? new Map(linkedSession.participants.map((participant) => [
        participant.userId,
        {
          ...buildParticipantLiveSnapshot(linkedSession, participant, now),
          ...buildOfficialStandingFields(linkedOfficialByUserId?.get(participant.userId)),
        },
      ]))
    : null;
  const roomState = getRunningMatchRoomState(room, store, now);
  const hasJoined = room.participants.some((participant) => participant.userId === currentUser.id);
  const joinedUserIds = new Set(room.participants.map((participant) => participant.userId));
  const pendingInvitedFriendIds = room.invitedFriendIds.filter((userId) => !joinedUserIds.has(userId));
  const linkedCurrentParticipant = linkedSession?.participants?.find((participant) => participant.userId === currentUser.id);

  if (linkedCurrentParticipant && isParticipantDoneWithMatch(linkedCurrentParticipant, now)) {
    return {
      success: true,
      serverNow: now.toISOString(),
      room: null,
    };
  }

  return {
    success: true,
    serverNow: now.toISOString(),
    room: {
      roomId: room.id,
      inviteToken: room.inviteToken,
      inviteLink: buildMatchRoomInviteLink(room.inviteToken),
      mode: room.mode,
      state: roomState,
      startMode: room.startMode,
      distanceKm: room.distanceKm,
      slotStartAt: room.slotStartAt,
      // 예약 방은 날짜까지 — 며칠 뒤 예약을 시각만 보고 수락하면 안 된다(옛 앱의 초대 카드가
      // 이 라벨을 그대로 그린다). 방장 시작 방의 링크 뒤 라벨은 예전 그대로 시각만.
      slotLabel: room.startMode === 'host' && !linkedSession
        ? '방장 시작'
        : room.startMode === 'scheduled'
          ? buildMatchRoomSlotLabel(room.slotStartAt)
          : formatDuelSlotLabelFromDateTime(room.slotStartAt),
      maxParticipants: room.maxParticipants,
      minParticipants: room.minParticipants,
      canStart: room.startMode === 'host'
        && room.hostUserId === currentUser.id
        && !linkedSession
        && room.participants.length >= room.minParticipants
        && areAllRunningMatchRoomGuestsReady(room),
      isHost: room.hostUserId === currentUser.id,
      hostUserId: room.hostUserId,
      hostName: hostUser.name,
      participants: room.participants
        .map((participant) => buildRunningMatchRoomParticipantPayload(store, participant, linkedParticipantFieldsByUserId))
        .sort((left, right) => {
          if (left.isHost !== right.isHost) {
            return left.isHost ? -1 : 1;
          }

          return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
        }),
      invitedFriendIds: room.invitedFriendIds,
      invitedFriends: pendingInvitedFriendIds.map((userId) => buildRunningMatchRoomInviteePayload(store, room, userId, room.updatedAt ?? room.createdAt)),
      countdownReadyCount: room.participants.filter((participant) => participant.isCountdownReady).length,
      countdownReadyRequiredCount: room.participants.length,
      // Gate on the DURABLE room.linkedMatchId, NOT the transient linkedSession lookup. A
      // momentary findMatchSessionById miss (store read race / brief absence while the session
      // is still attached) was dropping this whole block — nulling the guest's
      // linkedMatchSlotStartAt. Because the client commits the room wholesale (no merge), that
      // made the guest's countdown SLOT FLICKER null↔value, which bypasses the slot clamp
      // (clampLinkedMatchStateToSlot passes 'active' through when slot is null) and force-opens
      // the guest past its countdown — the on-device root cause of the guest countdown skip.
      // Fall back to room.slotStartAt (reconciled to the session slot at arm time) so the slot
      // can never vanish while a linked match is attached.
      ...(room.linkedMatchId ? {
        linkedMatchId: room.linkedMatchId,
        linkedMatchStatus: linkedMatchState === 'active' && linkedMatchSlotPassed ? 'active' : 'matched',
        linkedMatchSlotStartAt: linkedMatchSlotStartAt,
        linkedMatchDistanceKm: linkedSession?.distanceKm ?? room.distanceKm,
      } : {}),
      joined: hasJoined,
    },
  };
}

export function buildMatchRoomLockMessage(room, store, currentUserId) {
  const modeLabel = room.mode === 'duel' ? '1대1 방' : '그룹 방';
  const roomState = getRunningMatchRoomState(room, store);

  if (roomState === 'active') {
    return `이미 진행 중인 ${modeLabel}이 있어요. 현재 대결을 먼저 끝내야 새 매칭을 신청할 수 있어요.`;
  }

  if (room.startMode === 'host' && !room.linkedMatchId) {
    return `이미 참여 중인 ${modeLabel}이 있어요. 그 방을 먼저 나와야 다른 매칭을 신청할 수 있어요.`;
  }

  return `이미 예약된 ${modeLabel}이 있어요. 기존 방을 먼저 정리해야 다른 매칭을 신청할 수 있어요.`;
}

function getLiveRunShareEntryForUser(store, userId) {
  if (Array.isArray(store.liveRunShares)) {
    return store.liveRunShares.find((entry) => entry?.userId === userId) ?? null;
  }

  if (store.liveRunShares && typeof store.liveRunShares === 'object') {
    return store.liveRunShares[userId] ?? null;
  }

  return null;
}

export function buildRunningMatchRequestBlocker(store, currentUser, now = new Date()) {
  const existingSession = findAnyReservedMatchSessionForUser(store, currentUser.id, now);

  if (existingSession) {
    // 출발 전 예약만 '자동 복구 금지' 대상이다 — 이미 출발했거나 방장 시작 파티런이면 예전처럼
    // 클라의 강제 이탈로 풀 수 있어야 한다(안 그러면 막힌 세션에서 빠져나갈 길이 없다).
    const isPartyRun = isPendingScheduledPartySession(existingSession.session, now);
    return {
      legacyBlocker: 'matchSession',
      source: 'matchSessions.activeParticipant',
      // 파티런 예약은 카드/대기실에서 취소하라고 안내한다 — 클라의 blocker 자동 복구는
      // isPartyRun을 보고 강제 이탈을 건너뛴다(예약을 조용히 걷지 않는다).
      message: isPartyRun
        ? `이미 예약된 파티런이 있어요 (${buildMatchRoomSlotLabel(existingSession.session.slotStartAt)} 시작). 홈의 예정 매치 카드나 파티런 대기방에서 먼저 정리해야 다른 매칭을 신청할 수 있어요.`
        : buildSingleMatchLockMessage(existingSession.session.mode, existingSession.session.slotStartAt, existingSession.state),
      details: {
        source: 'matchSessions.activeParticipant',
        sessionId: existingSession.session.id,
        mode: existingSession.session.mode,
        state: existingSession.state,
        slotStartAt: existingSession.session.slotStartAt,
        ...(isPartyRun ? { isPartyRun: true } : {}),
      },
    };
  }

  const existingQueue = findAnyQueuedMatchEntryForUser(store, currentUser.id);

  if (existingQueue) {
    return {
      legacyBlocker: 'matchQueue',
      source: `matchQueues.${existingQueue.mode}`,
      message: buildSingleMatchLockMessage(existingQueue.mode, existingQueue.entry.slotStartAt, 'waiting'),
      details: {
        source: `matchQueues.${existingQueue.mode}`,
        queueId: existingQueue.entry.id,
        mode: existingQueue.mode,
        state: 'waiting',
        slotStartAt: existingQueue.entry.slotStartAt,
      },
    };
  }

  // 참가자로 들어가 있는 방만 막는다 — 초대만 받은 방(답하지 않은 초대)은 며칠을 살 수 있는
  // 예약 방이라도 다른 매칭을 막지 않는다 (2026-09-10).
  const existingRoom = findRunningMatchRoomJoinedByUser(store, currentUser.id, now);

  if (existingRoom) {
    const participant = existingRoom.participants.find((entry) => entry.userId === currentUser.id) ?? null;
    const isInvited = Array.isArray(existingRoom.invitedFriendIds) && existingRoom.invitedFriendIds.includes(currentUser.id);
    const roomState = getRunningMatchRoomState(existingRoom, store, now);
    const source = participant ? 'matchRooms.participant' : 'matchRooms.invited';

    return {
      legacyBlocker: 'activeRoom',
      source,
      message: buildMatchRoomLockMessage(existingRoom, store, currentUser.id),
      room: existingRoom,
      details: {
        source,
        roomId: existingRoom.id,
        mode: existingRoom.mode,
        state: roomState,
        startMode: existingRoom.startMode,
        // 예약(시간이 정해진) 방은 클라의 자동 회수가 조용히 나가면 안 된다 — 방장이 혼자 있는
        // 방이면 그 이탈이 곧 방 삭제라 예약 준비가 통째로 사라진다 (적대 검증 2026-09-10).
        ...(existingRoom.startMode === 'scheduled' ? { isPartyRun: true } : {}),
        slotStartAt: existingRoom.slotStartAt,
        linkedMatchId: existingRoom.linkedMatchId ?? null,
        isHost: existingRoom.hostUserId === currentUser.id,
        isParticipant: Boolean(participant),
        isInvited,
      },
    };
  }

  const liveRunShare = getLiveRunShareEntryForUser(store, currentUser.id);

  if (liveRunShare && !shouldClearLiveRunShareEntry(liveRunShare, now)) {
    return {
      legacyBlocker: 'liveRunShare',
      source: 'liveRunShares.active',
      message: buildLiveRunShareLockMessage(),
      details: {
        source: 'liveRunShares.active',
        state: String(liveRunShare.status ?? 'running'),
        updatedAt: liveRunShare.updatedAt ?? liveRunShare.lastUpdatedAt ?? liveRunShare.createdAt ?? null,
      },
    };
  }

  return null;
}

export function logRunningMatchRequestBlocker(label, currentUser, blocker) {
  if (!blocker) {
    return;
  }

  logBackendInfo(label, {
    userId: currentUser.id,
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details,
  });
}

export function buildRunningMatchBlockerApiDetails(blocker) {
  return {
    blocker: blocker.legacyBlocker,
    blockerSource: blocker.source,
    blockerDetails: blocker.details ?? null,
    code: blocker.legacyBlocker === 'activeRoom' ? 'active_room_blocked' : 'stale_room_blocked',
  };
}
