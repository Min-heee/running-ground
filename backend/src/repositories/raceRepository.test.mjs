import assert from 'node:assert/strict';
import { createJsonRaceRepository } from './raceRepository.mjs';

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
    offlineRaceEvents: [],
    offlineRaceGuideSteps: [],
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

function createRepositoryHarness(initialStore = {}) {
  const storeHarness = createStoreHarness(initialStore);
  let idIndex = 0;
  const repository = createJsonRaceRepository({
    loadStore: storeHarness.loadStore,
    mutateStore: storeHarness.mutateStore,
    requireUserByToken: (store, token) => {
      const session = store.sessions.find((entry) => entry.token === token);

      if (!session) {
        throw new TestApiError(401, '세션이 만료됐어요. 다시 로그인해주세요.');
      }

      return store.users.find((entry) => entry.id === session.userId);
    },
    ensureOfflineRaceStore: (store) => {
      if (!Array.isArray(store.offlineRaceEvents)) {
        store.offlineRaceEvents = [];
      }

      for (const event of store.offlineRaceEvents) {
        if (!Array.isArray(event.registeredUserTags)) {
          event.registeredUserTags = [];
        }
      }
    },
    buildOfflineRaceHub: (store, user) => ({
      featuredEvent: (store.offlineRaceEvents ?? []).find((event) => (event.registeredUserTags ?? []).includes(user.publicTag)) ?? null,
      upcomingEvents: (store.offlineRaceEvents ?? []).map((event) => ({ id: event.id })),
      pastEvents: [],
      guideSteps: store.offlineRaceGuideSteps ?? [],
    }),
    buildAdminOfflineRaceEvents: (store) => ({
      events: (store.offlineRaceEvents ?? []).map((event) => ({
        id: event.id,
        title: event.title,
      })),
    }),
    buildAdminOfflineRaceEvent: (_store, event) => ({
      id: event.id,
      title: event.title,
      capacity: event.capacity,
    }),
    decorateOfflineRaceEvent: (_store, event, user) => ({
      id: event.id,
      title: event.title,
      participantCount: [...new Set(event.registeredUserTags ?? [])].length,
      registered: (event.registeredUserTags ?? []).includes(user.publicTag),
    }),
    getOfflineRaceStatus: (event) => event.status ?? 'registration_open',
    nextId: (prefix) => {
      idIndex += 1;
      return `${prefix}-test-${idIndex}`;
    },
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
    console.log(`[raceRepository] ok - ${name}`);
  } catch (error) {
    console.error(`[raceRepository] failed - ${name}`);
    throw error;
  }
}

await runTest('joins and cancels an offline race entry', async () => {
  const { repository, storeHarness } = createRepositoryHarness({
    users: [{ id: 'user-me', publicTag: '#ME001' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    offlineRaceEvents: [{
      id: 'race-1',
      title: '한강 나이트런',
      capacity: 3,
      registeredUserTags: [],
    }],
  });

  const joined = await repository.applyEntryAction({
    token: 'token-me',
    eventId: 'race-1',
    action: 'join',
  });

  assert.deepEqual(joined, {
    success: true,
    event: {
      id: 'race-1',
      title: '한강 나이트런',
      participantCount: 1,
      registered: true,
    },
  });
  assert.deepEqual(storeHarness.getStore().offlineRaceEvents[0].registeredUserTags, ['#ME001']);

  const cancelled = await repository.applyEntryAction({
    token: 'token-me',
    eventId: 'race-1',
    action: 'cancel',
  });

  assert.equal(cancelled.event.registered, false);
  assert.deepEqual(storeHarness.getStore().offlineRaceEvents[0].registeredUserTags, []);
});

await runTest('rejects joining a full race', async () => {
  const { repository } = createRepositoryHarness({
    users: [{ id: 'user-me', publicTag: '#ME001' }],
    sessions: [{ token: 'token-me', userId: 'user-me' }],
    offlineRaceEvents: [{
      id: 'race-1',
      title: '한강 나이트런',
      capacity: 1,
      registeredUserTags: ['#OTHER'],
    }],
  });

  await assert.rejects(repository.applyEntryAction({
    token: 'token-me',
    eventId: 'race-1',
    action: 'join',
  }), (error) => {
    assertApiError(error, 409, '정원이 모두 차서 더 이상 신청할 수 없어요.');
    return true;
  });
});

await runTest('creates, updates, and deletes admin offline race events', async () => {
  const { repository, storeHarness } = createRepositoryHarness();

  const created = await repository.createAdminEvent({
    input: {
      title: '주말 10K',
      capacity: 50,
    },
  });

  assert.equal(created.event.id, 'race-test-1');

  const updated = await repository.updateAdminEvent({
    eventId: 'race-test-1',
    input: {
      title: '주말 15K',
      capacity: 80,
    },
  });

  assert.equal(updated.event.title, '주말 15K');

  const deleted = await repository.deleteAdminEvent({
    eventId: 'race-test-1',
  });

  assert.deepEqual(deleted, { events: [] });
  assert.equal(storeHarness.getStore().offlineRaceEvents.length, 0);
});
