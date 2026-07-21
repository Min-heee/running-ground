import assert from 'node:assert/strict';
import { createFriendsLeagueBridge } from './friendsLeagueBridge.mjs';

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createHarness({
  friendReadsEnabled = false,
  leagueReadsEnabled = false,
  sessionUser = { id: 'user-1', name: '러너' },
  jsonFriendsPayload = { ranks: [{ id: 'user-1' }], requests: [] },
  postgresFriendsPayload = { ranks: [{ id: 'user-db-1' }], requests: [] },
  jsonLeaguePayload = { currentNode: { id: 'region-seoul' }, breadcrumb: [{ id: 'region-root' }, { id: 'region-seoul' }], children: [] },
  postgresLeaguePayload = { currentNode: { id: 'region-busan' }, breadcrumb: [{ id: 'region-root' }, { id: 'region-busan' }], children: [] },
  postgresFriendError = null,
  postgresLeagueError = null,
} = {}) {
  const calls = {
    session: [],
    jsonFriends: [],
    postgresFriends: [],
    jsonLeague: [],
    postgresLeague: [],
  };

  const bridge = createFriendsLeagueBridge({
    sessionRunsBridge: {
      async findUserByToken({ token }) {
        calls.session.push(token);
        return {
          user: sessionUser,
          source: 'json',
        };
      },
    },
    friendsRepository: {
      async getLeaderboard({ token }) {
        calls.jsonFriends.push(['leaderboard', token]);
        return jsonFriendsPayload;
      },
      async getFriendActivity({ token, friendId }) {
        calls.jsonFriends.push(['activity', token, friendId]);
        return {
          friend: { id: friendId, rank: 1 },
          runs: [],
          monthlyDistanceKm: 10,
          monthlyPoints: 20,
        };
      },
      async getFriendRun({ token, friendId, runId }) {
        calls.jsonFriends.push(['run', token, friendId, runId]);
        return {
          run: { id: runId, source: '친구 기록' },
          weeklyDistanceKm: 10,
        };
      },
    },
    postgresFriendsRepository: {
      async getLeaderboardByUserId({ currentUserId }) {
        calls.postgresFriends.push(['leaderboard', currentUserId]);

        if (postgresFriendError) {
          throw postgresFriendError;
        }

        return postgresFriendsPayload;
      },
      async getFriendActivityByUserId({ currentUserId, friendId }) {
        calls.postgresFriends.push(['activity', currentUserId, friendId]);

        if (postgresFriendError) {
          throw postgresFriendError;
        }

        return {
          friend: { id: friendId, rank: 1 },
          runs: [],
          monthlyDistanceKm: 12,
          monthlyPoints: 25,
        };
      },
      async getFriendRunByUserId({ currentUserId, friendId, runId }) {
        calls.postgresFriends.push(['run', currentUserId, friendId, runId]);

        if (postgresFriendError) {
          throw postgresFriendError;
        }

        return {
          run: { id: runId, source: '친구 기록' },
          weeklyDistanceKm: 12,
        };
      },
    },
    leagueRepository: {
      async getDistrictPersonal({ token }) {
        calls.jsonLeague.push(['district', token]);
        return {
          districtName: '강남구',
          myRank: { id: 'user-1', rank: 1 },
          myPoints: 10,
          weeklyDistanceKm: 5,
          focusRanks: [],
          ranks: [],
        };
      },
      async getRegions({ token, nodeId }) {
        calls.jsonLeague.push(['regions', token, nodeId]);
        return jsonLeaguePayload;
      },
    },
    postgresLeagueRepository: {
      async getDistrictPersonalByUserId({ currentUserId }) {
        calls.postgresLeague.push(['district', currentUserId]);

        if (postgresLeagueError) {
          throw postgresLeagueError;
        }

        return {
          districtName: '서초구',
          myRank: { id: currentUserId, rank: 2 },
          myPoints: 20,
          weeklyDistanceKm: 10,
          focusRanks: [],
          ranks: [],
        };
      },
      async getRegionsByUserId({ currentUserId, nodeId }) {
        calls.postgresLeague.push(['regions', currentUserId, nodeId]);

        if (postgresLeagueError) {
          throw postgresLeagueError;
        }

        return postgresLeaguePayload;
      },
    },
    friendReadsEnabled,
    leagueReadsEnabled,
  });

  return {
    bridge,
    calls,
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[friendsLeagueBridge] ok - ${name}`);
  } catch (error) {
    console.error(`[friendsLeagueBridge] failed - ${name}`);
    throw error;
  }
}

await runTest('falls back to JSON friend leaderboard when postgres friend reads are disabled', async () => {
  const { bridge, calls } = createHarness();
  const result = await bridge.getFriendLeaderboard({
    store: {},
    token: 'token-1',
  });

  assert.equal(result.source, 'json');
  assert.equal(calls.postgresFriends.length, 0);
  assert.deepEqual(calls.jsonFriends, [['leaderboard', 'token-1']]);
});

await runTest('returns postgres friend leaderboard when enabled', async () => {
  const { bridge, calls } = createHarness({
    friendReadsEnabled: true,
  });
  const result = await bridge.getFriendLeaderboard({
    store: {},
    token: 'token-1',
  });

  assert.equal(result.source, 'postgres');
  assert.deepEqual(calls.session, ['token-1']);
  assert.deepEqual(calls.postgresFriends, [['leaderboard', 'user-1']]);
});

await runTest('falls back to JSON friend activity on postgres access errors', async () => {
  const { bridge, calls } = createHarness({
    friendReadsEnabled: true,
    postgresFriendError: new TestApiError(403, '친구로 연결된 사용자 기록만 볼 수 있어요.'),
  });
  const result = await bridge.getFriendActivity({
    store: {},
    token: 'token-1',
    friendId: 'friend-1',
  });

  assert.equal(result.source, 'json');
  assert.deepEqual(calls.jsonFriends, [['activity', 'token-1', 'friend-1']]);
});

await runTest('falls back to JSON region league when postgres region tree is empty', async () => {
  const { bridge, calls } = createHarness({
    leagueReadsEnabled: true,
    jsonLeaguePayload: {
      currentNode: { id: 'region-seoul' },
      breadcrumb: [{ id: 'region-root' }, { id: 'region-seoul' }],
      children: [{ id: 'region-gangnam' }],
    },
    postgresLeaguePayload: {
      currentNode: { id: 'region-root' },
      breadcrumb: [{ id: 'region-root' }],
      children: [],
    },
  });
  const result = await bridge.getRegions({
    store: {},
    token: 'token-1',
    nodeId: 'region-seoul',
  });

  assert.equal(result.source, 'json');
  assert.deepEqual(calls.jsonLeague, [['regions', 'token-1', 'region-seoul']]);
});
