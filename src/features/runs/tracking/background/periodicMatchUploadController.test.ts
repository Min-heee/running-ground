import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPeriodicMatchUploadAvailable,
  resetPeriodicMatchUploadForTest,
  startPeriodicMatchUpload,
  stopPeriodicMatchUpload,
} from '@/features/runs/tracking/background/periodicMatchUploadController';

type FakeNativeModule = {
  isNativePeriodicUploaderAvailable(): boolean;
  startPeriodicMatchUpload(url: string, authToken: string, jsonBody: string, intervalMs: number): boolean;
  updatePeriodicMatchPayload(url: string, authToken: string, jsonBody: string): boolean;
  stopPeriodicMatchUpload(): boolean;
  addMatchProgressResponseListener(listener: (body: string) => void): () => void;
};

type Recorder = {
  startCalls: { url: string; authToken: string; jsonBody: string; intervalMs: number }[];
  updateCalls: { url: string; authToken: string; jsonBody: string }[];
  stopCalls: number;
  listeners: ((body: string) => void)[];
  removedListeners: number;
  emit(body: string): void;
};

function buildFakeModule(available: boolean): { module: FakeNativeModule; recorder: Recorder } {
  const recorder: Recorder = {
    startCalls: [],
    updateCalls: [],
    stopCalls: 0,
    listeners: [],
    removedListeners: 0,
    emit(body: string) {
      this.listeners.forEach((listener) => listener(body));
    },
  };

  const module: FakeNativeModule = {
    isNativePeriodicUploaderAvailable: () => available,
    startPeriodicMatchUpload: (url, authToken, jsonBody, intervalMs) => {
      recorder.startCalls.push({ url, authToken, jsonBody, intervalMs });
      return true;
    },
    updatePeriodicMatchPayload: (url, authToken, jsonBody) => {
      recorder.updateCalls.push({ url, authToken, jsonBody });
      return true;
    },
    stopPeriodicMatchUpload: () => {
      recorder.stopCalls += 1;
      return true;
    },
    addMatchProgressResponseListener: (listener) => {
      recorder.listeners.push(listener);
      return () => {
        recorder.removedListeners += 1;
        recorder.listeners = recorder.listeners.filter((entry) => entry !== listener);
      };
    },
  };

  return { module, recorder };
}

const PAYLOAD = {
  url: 'https://preview.example.test/api/running/matches/progress',
  authToken: 'token-1',
  jsonBody: JSON.stringify({ matchId: 'm-1', distanceKm: 0.42 }),
};

// AVAILABILITY GATE — true only when the resolved module reports the periodic fns are linked.
test('isPeriodicMatchUploadAvailable reports false when no native module resolves', async () => {
  resetPeriodicMatchUploadForTest();
  const available = await isPeriodicMatchUploadAvailable(async () => null);
  assert.equal(available, false);
});

test('isPeriodicMatchUploadAvailable reports false when the module lacks the periodic fns', async () => {
  resetPeriodicMatchUploadForTest();
  const { module } = buildFakeModule(false);
  const available = await isPeriodicMatchUploadAvailable(async () => module);
  assert.equal(available, false);
});

test('isPeriodicMatchUploadAvailable reports true only when the native fns are present', async () => {
  resetPeriodicMatchUploadForTest();
  const { module } = buildFakeModule(true);
  const available = await isPeriodicMatchUploadAvailable(async () => module);
  assert.equal(available, true);
});

// OTA-SAFETY — every wrapper is a no-op when the native periodic uploader is unavailable, so the
// OTA bundle is safe on the current binaries (the existing JS-timer + location-task flush remains).
test('startPeriodicMatchUpload is a no-op (returns false) when unavailable', async () => {
  resetPeriodicMatchUploadForTest();
  const { module, recorder } = buildFakeModule(false);
  const applied: string[] = [];

  const started = await startPeriodicMatchUpload(
    'm-1',
    PAYLOAD,
    (body) => applied.push(body),
    3_000,
    async () => module,
  );

  assert.equal(started, false);
  assert.equal(recorder.startCalls.length, 0);
  assert.equal(recorder.listeners.length, 0);
});

test('stopPeriodicMatchUpload is a no-op (returns false) when unavailable', async () => {
  resetPeriodicMatchUploadForTest();
  const { module, recorder } = buildFakeModule(false);

  const stopped = await stopPeriodicMatchUpload(async () => module);

  assert.equal(stopped, false);
  assert.equal(recorder.stopCalls, 0);
});

// AVAILABLE PATH — start wires the cadence + response listener; the listener routes bodies to the
// applier; a re-start for the SAME match only refreshes the payload (no thread/listener churn).
test('startPeriodicMatchUpload starts the cadence and routes response bodies to the applier', async () => {
  resetPeriodicMatchUploadForTest();
  const { module, recorder } = buildFakeModule(true);
  const applied: string[] = [];

  const started = await startPeriodicMatchUpload(
    'm-1',
    PAYLOAD,
    (body) => applied.push(body),
    3_000,
    async () => module,
  );

  assert.equal(started, true);
  assert.equal(recorder.startCalls.length, 1);
  assert.deepEqual(recorder.startCalls[0], {
    url: PAYLOAD.url,
    authToken: PAYLOAD.authToken,
    jsonBody: PAYLOAD.jsonBody,
    intervalMs: 3_000,
  });
  assert.equal(recorder.listeners.length, 1);

  // A native re-POST emits the 2xx body; the controller routes it through the injected applier.
  recorder.emit('{"matchId":"m-1","distanceKm":0.5}');
  assert.deepEqual(applied, ['{"matchId":"m-1","distanceKm":0.5}']);

  // A second start for the SAME match refreshes the cached payload without restarting the thread
  // or re-subscribing the listener.
  const nextPayload = { ...PAYLOAD, jsonBody: JSON.stringify({ matchId: 'm-1', distanceKm: 0.9 }) };
  const restarted = await startPeriodicMatchUpload(
    'm-1',
    nextPayload,
    (body) => applied.push(body),
    3_000,
    async () => module,
  );

  assert.equal(restarted, true);
  assert.equal(recorder.startCalls.length, 1, 'thread is not restarted for the same match');
  assert.equal(recorder.listeners.length, 1, 'listener is not re-subscribed for the same match');
  assert.equal(recorder.updateCalls.length, 1, 'payload is refreshed instead');
  assert.deepEqual(recorder.updateCalls[0], {
    url: nextPayload.url,
    authToken: nextPayload.authToken,
    jsonBody: nextPayload.jsonBody,
  });

  await stopPeriodicMatchUpload(async () => module);
});

test('stopPeriodicMatchUpload stops the cadence and unsubscribes the listener', async () => {
  resetPeriodicMatchUploadForTest();
  const { module, recorder } = buildFakeModule(true);
  const applied: string[] = [];

  await startPeriodicMatchUpload('m-1', PAYLOAD, (body) => applied.push(body), 3_000, async () => module);
  const stopped = await stopPeriodicMatchUpload(async () => module);

  assert.equal(stopped, true);
  assert.equal(recorder.stopCalls, 1);
  assert.equal(recorder.removedListeners, 1);

  // After stop, a late native emit can no longer reach the applier (listener removed).
  recorder.emit('{"matchId":"m-1"}');
  assert.equal(applied.length, 0);
});

test('starting a different match tears down the prior listener before subscribing the new one', async () => {
  resetPeriodicMatchUploadForTest();
  const { module, recorder } = buildFakeModule(true);
  const appliedFirst: string[] = [];
  const appliedSecond: string[] = [];

  await startPeriodicMatchUpload('m-1', PAYLOAD, (body) => appliedFirst.push(body), 3_000, async () => module);
  await startPeriodicMatchUpload('m-2', PAYLOAD, (body) => appliedSecond.push(body), 3_000, async () => module);

  // The first listener was removed when the second match took over, so only the second applier
  // receives the body — a stale subscription can never double-apply onto the new match.
  assert.equal(recorder.removedListeners, 1);
  assert.equal(recorder.listeners.length, 1);
  recorder.emit('{"matchId":"m-2"}');
  assert.equal(appliedFirst.length, 0);
  assert.deepEqual(appliedSecond, ['{"matchId":"m-2"}']);

  await stopPeriodicMatchUpload(async () => module);
});
