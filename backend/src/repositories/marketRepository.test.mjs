import assert from 'node:assert/strict';
import { createJsonMarketRepository } from './marketRepository.mjs';

class TestApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStoreHarness(initialStore = {}) {
  let store = {
    users: [],
    sessions: [],
    marketCatalog: [],
    rewardRedemptions: [],
    ...clone(initialStore),
  };

  return {
    loadStore() {
      return clone(store);
    },
    mutateStore(mutator) {
      const nextStore = clone(store);
      const result = mutator(nextStore);
      store = nextStore;
      return result;
    },
    getStore() {
      return clone(store);
    },
  };
}

function createRepositoryHarness(initialStore = {}, metricsByUserId = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;
  const isActiveRewardRedemption = (entry) => entry?.status !== 'cancelled';

  const repository = createJsonMarketRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    ensureMarketCatalogStore: (store) => {
      if (!Array.isArray(store.marketCatalog)) {
        store.marketCatalog = [];
      }
    },
    buildMarketOverviewWithMetrics: (store, user, metrics) => ({
      currentPoints: Math.max(0, metrics.currentWeekPoints - ((store.rewardRedemptions ?? [])
        .filter((entry) => entry.userId === user.id && isActiveRewardRedemption(entry))
        .reduce((sum, entry) => sum + (entry.costPoints ?? 0), 0))),
      items: store.marketCatalog.map((item) => ({ id: item.id, title: item.title })),
    }),
    buildAdminMarketCatalog: (store) => ({
      items: (store.marketCatalog ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        redemptionCount: (store.rewardRedemptions ?? []).filter((entry) => entry.itemId === item.id && isActiveRewardRedemption(entry)).length,
      })),
    }),
    buildAdminMarketItem: (_store, item) => ({
      id: item.id,
      title: item.title,
      costPoints: item.costPoints,
    }),
    buildAdminRewardRedemptions: (store) => ({
      items: (store.rewardRedemptions ?? []).map((entry) => ({
        id: entry.id,
        status: entry.status,
        adminNote: entry.adminNote,
        fulfilledAt: entry.fulfilledAt,
      })),
    }),
    buildAdminRewardRedemption: (_store, entry) => ({
      id: entry.id,
      status: entry.status,
      adminNote: entry.adminNote,
      fulfilledAt: entry.fulfilledAt,
    }),
    getUserMetrics: (_store, userId) => metricsByUserId[userId] ?? { currentWeekPoints: 0 },
    getAvailableRewardPoints: (metrics, redeemedCost) => Math.max(0, metrics.currentWeekPoints - redeemedCost),
    getRedeemedPointCost: (store, userId) => (store.rewardRedemptions ?? [])
      .filter((entry) => entry.userId === userId && isActiveRewardRedemption(entry))
      .reduce((sum, entry) => sum + (entry.costPoints ?? 0), 0),
    buildRedemptionCountByItemId: (store) => (store.rewardRedemptions ?? []).reduce((map, entry) => {
      if (!isActiveRewardRedemption(entry)) {
        return map;
      }

      map.set(entry.itemId, (map.get(entry.itemId) ?? 0) + 1);
      return map;
    }, new Map()),
    getMarketItemRemainingStock: (item, redemptionCount) => (
      typeof item.inventoryCount === 'number' ? Math.max(0, item.inventoryCount - redemptionCount) : null
    ),
    isActiveRewardRedemption,
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
    nowIso: () => '2026-04-24T04:00:00.000Z',
    createError: (statusCode, message) => new TestApiError(statusCode, message),
  });

  return {
    repository,
    storeHarness,
  };
}

function assertApiError(error, statusCode, message) {
  assert(error instanceof TestApiError);
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.message, message);
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[marketRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[marketRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('claims an item and refreshes the user overview', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [{ id: 'user-me', name: '민병희' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    marketCatalog: [{
      id: 'market-1',
      title: '러닝 양말',
      costPoints: 30,
      repeatable: false,
      isActive: true,
      inventoryCount: 5,
    }],
  }, {
    'user-me': { currentWeekPoints: 80 },
  });

  const result = await repository.claimItem({
    token: 'token-me',
    itemId: 'market-1',
  });

  assert.deepEqual(result, {
    success: true,
    claimedItemId: 'market-1',
    overview: {
      currentPoints: 50,
      items: [{ id: 'market-1', title: '러닝 양말' }],
    },
  });
  assert.equal(storeHarness.getStore().rewardRedemptions.length, 1);
});

await runTest('rejects duplicate claims for non-repeatable items', async () => {
  const { repository } = createRepositoryHarness({
    users: [{ id: 'user-me', name: '민병희' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    marketCatalog: [{
      id: 'market-1',
      title: '러닝 양말',
      costPoints: 30,
      repeatable: false,
      isActive: true,
      inventoryCount: 5,
    }],
    rewardRedemptions: [{
      id: 'redemption-1',
      userId: 'user-me',
      itemId: 'market-1',
      costPoints: 30,
      status: 'requested',
    }],
  }, {
    'user-me': { currentWeekPoints: 80 },
  });

  await assert.rejects(repository.claimItem({
    token: 'token-me',
    itemId: 'market-1',
  }), (error) => {
    assertApiError(error, 409, '이미 교환한 리워드예요.');
    return true;
  });
});

await runTest('updates redemption fulfillment state and admin note', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    rewardRedemptions: [{
      id: 'redemption-1',
      userId: 'user-me',
      itemId: 'market-1',
      costPoints: 30,
      status: 'requested',
      adminNote: '',
    }],
  });

  const result = await repository.updateAdminRewardRedemption({
    redemptionId: 'redemption-1',
    status: 'fulfilled',
    adminNote: '택배 발송 완료',
  });

  assert.equal(result.item.status, 'fulfilled');
  assert.equal(result.item.adminNote, '택배 발송 완료');
  assert.equal(result.item.fulfilledAt, '2026-04-24T04:00:00.000Z');
  assert.equal(storeHarness.getStore().rewardRedemptions[0].fulfilledAt, '2026-04-24T04:00:00.000Z');
});
