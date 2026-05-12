import { myProfile } from '@/data/mock';
import { getCurrentUserProfile } from '@/lib/session';
import { mockApiState } from './state';

export function normalizeMockFriendRanks(ranks: typeof mockApiState.friendRanks) {
  return [...ranks]
    .sort((left, right) => {
      if (right.distanceKm !== left.distanceKm) {
        return right.distanceKm - left.distanceKm;
      }

      if (right.points !== left.points) {
        return right.points - left.points;
      }

      return left.name.localeCompare(right.name, 'ko');
    })
    .map((runner, index) => ({
      ...runner,
      rank: index + 1,
    }));
}

export function createMockFriendRank(input: { id: string; name: string; tag: string }) {
  const nextIndex = mockApiState.friendRanks.length + 1;
  const distanceKm = Number((62 + nextIndex * 4.3).toFixed(1));

  return {
    id: input.id,
    name: input.name,
    tag: input.tag,
    distanceKm,
    points: Math.round(distanceKm * 1.15),
    rank: nextIndex,
    isRunningNow: false,
    liveLocationLabel: undefined,
  };
}

export function upsertMockCurrentUserRank() {
  const profile = getCurrentUserProfile() ?? myProfile;
  const existingRank = mockApiState.friendRanks.find((entry) => entry.tag === profile.publicTag);

  if (existingRank) {
    existingRank.name = profile.name;
    existingRank.tag = profile.publicTag;
    return existingRank;
  }

  const nextRank = createMockFriendRank({
    id: `me-${Date.now()}`,
    name: profile.name,
    tag: profile.publicTag,
  });

  mockApiState.friendRanks = normalizeMockFriendRanks([...mockApiState.friendRanks, nextRank]);
  return mockApiState.friendRanks.find((entry) => entry.tag === profile.publicTag) ?? nextRank;
}
