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
  LeaveRunningMatchRoomInput,
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
  shouldFallbackToLocalRunningRoomApi,
  recalculateMockRunningMatchRoomCanStart,
  decorateMockRunningMatchRoom,
  createMockRunningMatchRoomState,
  applyMockRunningMatchRoomUpdate,
} from './_shared';

export async function fetchRunningMatchRoom(): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    return sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)));
  }

  try {
    const payload = await apiGet<RunningMatchRoomResponse>(
      '/running/rooms/my',
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '내 방 상태를 불러오지 못했어.',
      },
    );

    return sanitizeRunningMatchRoomResponse(payload);
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)));
    }

    throw error;
  }
}

export async function cleanupStaleRunningMatchRoomState(): Promise<RunningMatchRoomCleanupResponse> {
  if (USE_MOCK_API) {
    const hasRoom = Boolean(mockApiState.runningMatchRoom);
    return {
      success: true,
      cleaned: false,
      cleanedItems: [],
      ...(hasRoom ? { blocker: 'activeRoom' as const } : {}),
      room: hasRoom
        ? sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))).room
        : null,
    };
  }

  try {
    const payload = await apiPost<RunningMatchRoomCleanupResponse>(
      '/running/rooms/cleanup-stale',
      {},
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '이전 방 상태를 정리하지 못했어.',
      },
    );

    return {
      ...payload,
      room: sanitizeRunningMatchRoomResponse({
        success: payload.success,
        serverNow: payload.serverNow,
        room: payload.room,
      }).room,
    };
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return {
        success: true,
        cleaned: false,
        cleanedItems: [],
        room: sanitizeRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom))).room,
      };
    }

    throw error;
  }
}

export async function createRunningMatchRoom(input: CreateRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    createMockRunningMatchRoomState(input);
    return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms',
      {
        ...input,
        distanceKm: Number(input.distanceKm.toFixed(1)),
        maxParticipants: input.maxParticipants ? Math.round(input.maxParticipants) : undefined,
        invitedFriendIds: input.invitedFriendIds ?? [],
      },
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방을 만들지 못했어.',
      },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      createMockRunningMatchRoomState(input);
      return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
    }

    throw error;
  }
}

export async function joinRunningMatchRoom(input: JoinRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    return ensureJoinedRunningMatchRoomResponse(buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom)));
  }

  try {
    const payload = await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/join',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방에 들어가지 못했어.',
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
    return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/update',
      {
        ...input,
        distanceKm: Number(input.distanceKm.toFixed(1)),
        maxParticipants: input.maxParticipants ? Math.round(input.maxParticipants) : undefined,
        invitedFriendIds: input.invitedFriendIds ?? [],
      },
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방 설정을 저장하지 못했어.',
      },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      applyMockRunningMatchRoomUpdate(input);
      return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
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

    return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/start',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방 시작을 반영하지 못했어.',
      },
    );
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

      return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
    }

    throw error;
  }
}

export async function leaveRunningMatchRoom(input: LeaveRunningMatchRoomInput): Promise<RunningMatchRoomResponse> {
  if (USE_MOCK_API) {
    mockApiState.runningMatchRoom = null;
    return buildMockRunningMatchRoomResponse(null);
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/leave',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '방에서 나가지 못했어.',
      },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      mockApiState.runningMatchRoom = null;
      return buildMockRunningMatchRoomResponse(null);
    }

    throw error;
  }
}

export async function updateRunningMatchRoomReady(input: UpdateRunningMatchRoomReadyInput): Promise<RunningMatchRoomResponse> {
  const profile = getCurrentUserProfile() ?? myProfile;
  const currentUserId = profile.publicTag || 'mock-current-user';

  const applyLocalReadyState = () => {
    if (!mockApiState.runningMatchRoom || mockApiState.runningMatchRoom.roomId !== input.roomId) {
      return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
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
    return applyLocalReadyState();
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/ready',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '준비 상태를 바꾸지 못했어.',
      },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return applyLocalReadyState();
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
      return buildMockRunningMatchRoomResponse(decorateMockRunningMatchRoom(mockApiState.runningMatchRoom));
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
    return applyLocalCountdownReady();
  }

  try {
    return await apiPost<RunningMatchRoomResponse>(
      '/running/rooms/countdown-ready',
      input,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '카운트다운 준비 상태를 반영하지 못했어.',
      },
    );
  } catch (error) {
    if (shouldFallbackToLocalRunningRoomApi(error)) {
      return applyLocalCountdownReady();
    }

    throw error;
  }
}
