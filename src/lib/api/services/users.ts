import {
  apiGet,
} from '../client';

import { USE_MOCK_API } from '../config';

import type { OpponentMatchProfile } from '../types';

import {
  mockApiState,
  normalizeMockFriendRanks,
  requireAccessToken,
} from './_shared';

export async function fetchOpponentMatchProfile(userId: string): Promise<OpponentMatchProfile> {
  if (USE_MOCK_API) {
    const normalizedRanks = normalizeMockFriendRanks(mockApiState.friendRanks);
    const opponent = normalizedRanks.find((entry) => entry.id === userId) ?? normalizedRanks[0];

    return {
      id: opponent.id,
      name: opponent.name,
      publicTag: opponent.tag ?? '#OPP',
      provinceName: '서울특별시',
      districtName: '성동구',
      rankState: { tier: '러너', lp: Math.max(0, opponent.points % 200) },
      lifetimeDistanceKm: opponent.distanceKm,
      matchRecord: {
        total: 12,
        duel: 8,
        group: 4,
      },
    };
  }

  return apiGet<OpponentMatchProfile>(
    `/users/${encodeURIComponent(userId)}/match-profile`,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '상대 프로필을 불러오지 못했어요.',
    },
  );
}
