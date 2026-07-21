import {
  myProfile,
} from '@/data/mock';

import {
  getCurrentUserProfile,
} from '@/lib/session';

import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  AcknowledgeRunningMatchRoomCountdownInput,
  CreateRunningMatchRoomInput,
  JoinRunningMatchRoomInput,
  JoinedRunningMatchRoomResponse,
  LeaveRunningMatchRoomInput,
  RunningMatchForceResetResponse,
  RunningMatchRoomCleanupResponse,
  RunningMatchRoomResponse,
  StartRunningMatchRoomInput,
  UpdateRunningMatchRoomReadyInput,
  UpdateRunningMatchRoomInput,
} from '../types';

import {
  mockApiState,
  sanitizeRunningMatchRoomResponse,
  formatDuelSlotLabel,
  requireAccessToken,
  buildMockRunningMatchRoomResponse,
  ensureJoinedRunningMatchRoomResponse,
  ensureRunningMatchRoomCleanupResponse,
  ensureRunningMatchRoomResponse,
  shouldFallbackToLocalRunningRoomApi,
  recalculateMockRunningMatchRoomCanStart,
  decorateMockRunningMatchRoom,
  createMockRunningMatchRoomState,
  applyMockRunningMatchRoomUpdate,
} from './_shared';

type FetchRunningMatchRoomOptions = {
  signal?: AbortSignal;
};

export async function fetchRunningMatchRoom(options: FetchRunningMatchRoomOptions = {}): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    return ensureRunningMatchRoomResponse(
      sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))),
      { action: 'fetch-active-room' },
    );
  }

  try {
    const payload = await apiGet<RunningMatchRoomResponse>(
      '/running/rooms/my',
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '내 방 상태를 불러오지 못했어요.',
        signal: options.signal,
      },
    );

    return ensureRunningMatchRoomResponse(
      sanitizeRunningMatchRoomResponse(payload),
      { action: 'fetch-active-room' },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return ensureRunningMatchRoomResponse(
        sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))),
        { action: 'fetch-active-room' },
      );
    }

    throw error;
  }
}

export async function fetchRunningMatchRoomInviteInbox(options: FetchRunningMatchRoomOptions = {}): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    return fetchRunningMatchRoom(options);
  }

  try {
    const payload = await apiGet<RunningMatchRoomResponse>(
      '/running/rooms/invite-inbox',
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '초대함을 불러오지 못했어요.',
        signal: options.signal,
      },
    );

    return ensureRunningMatchRoomResponse(
      sanitizeRunningMatchRoomResponse(payload),
      { action: 'fetch-invite-inbox' },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return fetchRunningMatchRoom(options);
    }

    throw error;
  }
}

export async function cleanupStaleRunningMatchRoomState(): Promise<RunningMatchRoomCleanupResponse> {
  if (USE_MOCK_API) {
    const hasRoom = Boolean(mockApiState.runningMatchRoom);
    return ensureRunningMatchRoomCleanupResponse({
      success: true,
      cleaned: false,
      cleanedItems: [],
      ...(hasRoom ? { blocker: 'activeRoom' as const } : {}),
      room: hasRoom
        ? sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))).room
        : null,
    });
  }

  try {
    const payload = await apiPost<RunningMatchRoomCleanupResponse>(
      '/running/rooms/cleanup-stale',
      {},
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '이전 방 상태를 정리하지 못했어요.',
      },
    );

    return ensureRunningMatchRoomCleanupResponse({
      ...payload,
      room: sanitizeRunningMatchRoomResponse({
        success: payload.success,
        serverNow: payload.serverNow,
        room: payload.room,
      }).room,
    });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return ensureRunningMatchRoomCleanupResponse({
        success: true,
        cleaned: false,
        cleanedItems: [],
        room: sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))).room,
      });
    }

    throw error;
  }
}

export async function forceResetRunningMatchState(): Promise<RunningMatchForceResetResponse> {
  if (USE_MOCK_API) {
    mockApiState.runningMatchRoom = null;
    mockApiState.runningMatchSessions.duel = null;
    mockApiState.runningMatchSessions.group = null;

    return {
      success: true,
      serverNow: new Date().toISOString(),
      cleaned: true,
      cleanedItems: ['mock.runningMatch.forceReset'],
    };
  }

  return apiPost<RunningMatchForceResetResponse>(
    '/running/rooms/force-reset',
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매칭 상태를 강제로 초기화하지 못했어요.',
    },
  );
}

export async function createRunningMatchRoom(input: CreateRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    createMockRunningMatchRoomState(input);
    return ensureRunningMatchRoomResponse(
      buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
      { action: 'create-room', requireRoom: true },
    );
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms',
      {
        ...input,
        distanceKm: Number(input.distanceKm.toFixed(1)),
        maxParticipants: input.maxParticipants ? Math.round(input.maxParticipants) : undefined,
        invitedFriendIds: input.invitedFriendIds ?? [],
      },
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방을 만들지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'create-room', requireRoom: true });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      createMockRunningMatchRoomState(input);
      return ensureRunningMatchRoomResponse(
        buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
        { action: 'create-room', requireRoom: true },
      );
    }

    throw error;
  }
}

export async function joinRunningMatchRoom(input: JoinRunningMatchRoomInput): Promise<JoinedRunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    return ensureJoinedRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)));
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/join',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방에 들어가지 못했어요.',
      },
    );

    return ensureJoinedRunningMatchRoomResponse(payload);
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return ensureJoinedRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)));
    }

    throw error;
  }
}

export async function updateRunningMatchRoom(input: UpdateRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    applyMockRunningMatchRoomUpdate(input);
    return ensureRunningMatchRoomResponse(
      buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
      { action: 'update-room', requireRoom: true },
    );
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/update',
      {
        ...input,
        distanceKm: Number(input.distanceKm.toFixed(1)),
        maxParticipants: input.maxParticipants ? Math.round(input.maxParticipants) : undefined,
        invitedFriendIds: input.invitedFriendIds ?? [],
      },
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방 설정을 저장하지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'update-room', requireRoom: true });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      applyMockRunningMatchRoomUpdate(input);
      return ensureRunningMatchRoomResponse(
        buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
        { action: 'update-room', requireRoom: true },
      );
    }

    throw error;
  }
}

export async function startRunningMatchRoom(input: StartRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    if (mockApiState.runningMatchRoom) {
      const slotStartAt = new Date(Date.now() + 40_000).toISOString();
      mockApiState.runningMatchRoom = {
        ...mockApiState.runningMatchRoom,
        state: 'arming',
        slotStartAt,
        slotLabel: formatDuelSlotLabel(slotStartAt),
        canStart: false,
        participants: mockApiState.runningMatchRoom.participants.map((participant) => ({
          ...participant,
          isCountdownReady: true,
        })),
        linkedMatchId: `mock-room-match-${Date.now()}`,
        linkedMatchStatus: 'matched',
        linkedMatchSlotStartAt: slotStartAt,
        linkedMatchDistanceKm: mockApiState.runningMatchRoom.distanceKm,
      };
    }

    return ensureRunningMatchRoomResponse(
      buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
      { action: 'start-room', requireRoom: true },
    );
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/start',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방 시작을 반영하지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'start-room', requireRoom: true });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      if (mockApiState.runningMatchRoom) {
        const slotStartAt = new Date(Date.now() + 40_000).toISOString();
        mockApiState.runningMatchRoom = {
          ...mockApiState.runningMatchRoom,
          state: 'arming',
          slotStartAt,
          slotLabel: formatDuelSlotLabel(slotStartAt),
          canStart: false,
          participants: mockApiState.runningMatchRoom.participants.map((participant) => ({
            ...participant,
            isCountdownReady: true,
          })),
          linkedMatchId: `mock-room-match-${Date.now()}`,
          linkedMatchStatus: 'matched',
          linkedMatchSlotStartAt: slotStartAt,
          linkedMatchDistanceKm: mockApiState.runningMatchRoom.distanceKm,
        };
      }

      return ensureRunningMatchRoomResponse(
        buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
        { action: 'start-room', requireRoom: true },
      );
    }

    throw error;
  }
}

export async function leaveRunningMatchRoom(input: LeaveRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    mockApiState.runningMatchRoom = null;
    return ensureRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(null), { action: 'leave-room' });
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/leave',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방에서 나가지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'leave-room' });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      mockApiState.runningMatchRoom = null;
      return ensureRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(null), { action: 'leave-room' });
    }

    throw error;
  }
}

export async function updateRunningMatchRoomReady(input: UpdateRunningMatchRoomReadyInput): Promise<RunningMatchRoomResponse> {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = profile.publicTag || 'mock-current-user';

  const applyLocalReadyState = () => {
    if (!mockApiState.runningMatchRoom || mockApiState.runningMatchRoom.roomId !== input.roomId) {
      return ensureRunningMatchRoomResponse(
        buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
        { action: 'update-ready', requireRoom: true },
      );
    }

    mockApiState.runningMatchRoom = {
      ...mockApiState.runningMatchRoom,
      participants: mockApiState.runningMatchRoom.participants.map((participant) => (
        participant.userId === currentUserId
          ? { ...participant, isReady: input.ready }
          : participant
      )),
    };

    mockApiState.runningMatchRoom = recalculateMockRunningMatchRoomCanStart(mockApiState.runningMatchRoom);
    return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
  };

  if (USE_MOCK_API) {
    return ensureRunningMatchRoomResponse(applyLocalReadyState(), { action: 'update-ready', requireRoom: true });
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/ready',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '준비 상태를 바꾸지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'update-ready', requireRoom: true });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return ensureRunningMatchRoomResponse(applyLocalReadyState(), { action: 'update-ready', requireRoom: true });
    }

    throw error;
  }
}

export async function acknowledgeRunningMatchRoomCountdown(
  input: AcknowledgeRunningMatchRoomCountdownInput,
): Promise<RunningMatchRoomResponse> {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = profile.publicTag || 'mock-current-user';

  const applyLocalCountdownReady = () => {
    if (!mockApiState.runningMatchRoom || mockApiState.runningMatchRoom.roomId !== input.roomId) {
      return ensureRunningMatchRoomResponse(
        buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)),
        { action: 'countdown-ready', requireRoom: true },
      );
    }

    mockApiState.runningMatchRoom = {
      ...mockApiState.runningMatchRoom,
      participants: mockApiState.runningMatchRoom.participants.map((participant) => (
        participant.userId === currentUserId
          ? { ...participant, isCountdownReady: true }
          : participant
      )),
    };

    if (mockApiState.runningMatchRoom.participants.every((participant) => participant.isCountdownReady)) {
      const slotStartAt = new Date(Date.now() + 30_000).toISOString();
      mockApiState.runningMatchRoom = {
        ...mockApiState.runningMatchRoom,
        state: 'countdown',
        slotStartAt,
        slotLabel: formatDuelSlotLabel(slotStartAt),
        linkedMatchSlotStartAt: slotStartAt,
      };
    }

    return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
  };

  if (USE_MOCK_API) {
    return ensureRunningMatchRoomResponse(applyLocalCountdownReady(), { action: 'countdown-ready', requireRoom: true });
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/countdown-ready',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '카운트다운 준비 상태를 반영하지 못했어요.',
      },
    );

    return ensureRunningMatchRoomResponse(payload, { action: 'countdown-ready', requireRoom: true });
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return ensureRunningMatchRoomResponse(applyLocalCountdownReady(), { action: 'countdown-ready', requireRoom: true });
    }

    throw error;
  }
}
