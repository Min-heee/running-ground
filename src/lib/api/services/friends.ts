import { friendRunRecords } from '@/data/mock';

import {
  apiGet,
  apiPost,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  CreateFriendRequestResponse,
  FriendActivityResponse,
  FriendLeaderboardResponse,
  FriendRelationResponse,
  FriendRequestActionResponse,
} from '../types';

import {
  mockApiState,
  normalizeMockFriendRanks,
  createMockFriendRank,
  requireAccessToken,
} from './_shared';

export async function fetchFriendLeaderboard(): Promise<FriendLeaderboardResponse> {
  if (USE_MOCK_API) {
    return {
      ranks: normalizeMockFriendRanks(mockApiState.friendRanks),
      requests: mockApiState.friendRequests,
    };
  }

  return apiGet<FriendLeaderboardResponse>('/friends/leaderboard', {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 랭킹을 불러오지 못했어요.',
  });
}

// 사람 탭 분기용 관계 조회 — 랭킹 보드에서 아무 유저나 눌렀을 때의 재료.
export async function fetchFriendRelation(userId: string): Promise<FriendRelationResponse> {
  if (USE_MOCK_API) {
    const isFriend = normalizeMockFriendRanks(mockApiState.friendRanks).some((entry) => entry.id === userId);
    return { userId, name: '러너', relation: isFriend ? 'friend' : 'none' };
  }

  return apiGet<FriendRelationResponse>(`/friends/relation/${encodeURIComponent(userId)}`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '사용자 정보를 불러오지 못했어요.',
  });
}

// 태그 없이 유저ID로 친구 신청 (랭킹 보드 경로).
export async function sendFriendRequestToUser(userId: string): Promise<CreateFriendRequestResponse> {
  if (USE_MOCK_API) {
    return { success: true, requestId: `mock-request-${userId}`, status: 'pending' };
  }

  return apiPost<CreateFriendRequestResponse>(
    '/friends/requests/by-user',
    { userId },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 신청을 보내지 못했어요.',
    },
  );
}

export async function fetchFriendActivity(friendId?: string): Promise<FriendActivityResponse> {
  if (USE_MOCK_API) {
    const normalizedRanks = normalizeMockFriendRanks(mockApiState.friendRanks);
    const friend = friendId
      ? (normalizedRanks.find((entry) => entry.id === friendId) ?? normalizedRanks[0])
      : normalizedRanks[0];

    return {
      friend,
      runs: friendRunRecords,
      monthlyDistanceKm: Number(friendRunRecords.reduce((sum, run) => sum + run.distanceKm, 0).toFixed(1)),
      monthlyPoints: friend.points,
    };
  }

  if (!friendId) {
    throw new Error('친구 정보를 찾을 수 없어요.');
  }

  return apiGet<FriendActivityResponse>(`/friends/${friendId}/activity`, {
    accessToken: await requireAccessToken(),
    fallbackMessage: '친구 활동을 불러오지 못했어요.',
  });
}

export async function createFriendRequest(tag: string): Promise<CreateFriendRequestResponse> {
  if (USE_MOCK_API) {
    const normalizedTag = tag.trim().toUpperCase();
    const requestId = `mock-${Date.now()}`;
    const existingFriend = mockApiState.friendRanks.find((entry) => entry.tag === normalizedTag);

    mockApiState.friendRequests = [
      ...mockApiState.friendRequests.filter((entry) => entry.tag !== normalizedTag),
      {
        id: requestId,
        name: existingFriend?.name
          ?? mockApiState.friendRequests.find((entry) => entry.tag === normalizedTag)?.name
          ?? '새 친구',
        tag: normalizedTag,
        status: 'pending',
      },
    ];

    return {
      success: true,
      requestId,
      status: 'pending',
    };
  }

  return apiPost<CreateFriendRequestResponse>(
    '/friends/requests',
    {
      tag: tag.trim().toUpperCase(),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 전송에 실패했어요.',
    },
  );
}

export async function acceptFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    const acceptedRequest = mockApiState.friendRequests.find((request) => request.id === requestId);

    if (acceptedRequest && !mockApiState.friendRanks.some((entry) => entry.tag === acceptedRequest.tag)) {
      mockApiState.friendRanks = normalizeMockFriendRanks([
        ...mockApiState.friendRanks,
        createMockFriendRank({
          id: `friend-${requestId}`,
          name: acceptedRequest.name,
          tag: acceptedRequest.tag,
        }),
      ]);
    } else {
      mockApiState.friendRanks = normalizeMockFriendRanks(mockApiState.friendRanks);
    }

    mockApiState.friendRequests = mockApiState.friendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'accepted',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/accept`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 수락에 실패했어요.',
    },
  );
}

export async function rejectFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    mockApiState.friendRequests = mockApiState.friendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'rejected',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/reject`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '친구 요청 거절에 실패했어요.',
    },
  );
}

export async function cancelFriendRequest(requestId: string): Promise<FriendRequestActionResponse> {
  if (USE_MOCK_API) {
    mockApiState.friendRequests = mockApiState.friendRequests.filter((request) => request.id !== requestId);

    return {
      success: true,
      requestId,
      status: 'cancelled',
    };
  }

  return apiPost<FriendRequestActionResponse>(
    `/friends/requests/${requestId}/cancel`,
    {},
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '보낸 친구 요청 취소에 실패했어요.',
    },
  );
}
