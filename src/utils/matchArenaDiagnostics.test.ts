import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMatchArenaDiagnosticsThrottle,
  reportComponentMountDiagnostics,
  reportMatchArenaDiagnostics,
  resetMatchArenaDiagnosticsForTest,
} from '@/utils/matchArenaDiagnostics';

const baseInput = {
  instanceId: 'tab-test-1',
  mode: 'tab',
  showLiveArena: false,
  canRenderLiveArena: false,
  shouldKeepRunningMatchArena: false,
  isCurrentUserForfeited: false,
  isRunning: false,
  hasMatchResultPage: false,
  forceOpenActiveMatch: false,
  trackingStatus: 'idle',
  matchMode: 'duel',
  duelMatchState: 'matched',
  duelArenaParticipantsLength: 0,
  duelShouldOpenCountdownArena: false,
  duelShouldHoldArenaDuringActivation: false,
  hasRoomLinkedDuelContext: true,
  roomLinkedDuelPlaceholderParticipantsLength: 1,
  roomShouldOpenCountdownArena: false,
  partyRunPhase: 'countdown',
  remainingSeconds: 20,
  roomState: 'countdown',
  linkedMatchStatus: 'matched',
  linkedMatchId: 'duel-match-1',
};

test('match arena diagnostics logs the first release-safe warning', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    reportMatchArenaDiagnostics(baseInput);
  } finally {
    console.warn = originalWarn;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '[arena-diag]');
  assert.equal(typeof warnings[0][1], 'string');
  assert.match(String(warnings[0][1]), /"matchMode":"duel"/);
});

test('match arena diagnostics throttles identical input within one second', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  try {
    reportMatchArenaDiagnostics(baseInput);
    nowMs += 500;
    reportMatchArenaDiagnostics(baseInput);
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 1);
});

test('match arena diagnostics isolates throttles per runtime instance', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const firstThrottle = createMatchArenaDiagnosticsThrottle();
  const secondThrottle = createMatchArenaDiagnosticsThrottle();
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  try {
    reportMatchArenaDiagnostics(baseInput, firstThrottle);
    nowMs += 100;
    reportMatchArenaDiagnostics(baseInput, secondThrottle);
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 2);
});

test('match arena diagnostics throttles identical input within one injected instance throttle', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const throttle = createMatchArenaDiagnosticsThrottle();
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  try {
    reportMatchArenaDiagnostics(baseInput, throttle);
    nowMs += 500;
    reportMatchArenaDiagnostics(baseInput, throttle);
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 1);
});

test('match arena diagnostics logs changed input without waiting for throttle window', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  try {
    reportMatchArenaDiagnostics(baseInput);
    nowMs += 100;
    reportMatchArenaDiagnostics({
      ...baseInput,
      roomLinkedDuelPlaceholderParticipantsLength: 2,
      roomShouldOpenCountdownArena: true,
    });
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 2);
});

test('component mount diagnostics logs release-safe mount warning with prefix', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    reportComponentMountDiagnostics({
      componentName: 'LiveMatchTrackingPage',
      instanceId: 'tracking-page-test',
      mountPhase: 'mount',
      payload: {
        matchMode: 'duel',
        includeMatchCards: true,
      },
    });
  } finally {
    console.warn = originalWarn;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], '[arena-mount]');
  assert.match(String(warnings[0][1]), /"componentName":"LiveMatchTrackingPage"/);
});

test('component mount diagnostics throttles identical input per injected instance throttle', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const throttle = createMatchArenaDiagnosticsThrottle();
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  const input = {
    componentName: 'LiveMatchContainer',
    instanceId: 'container-test',
    mountPhase: 'update' as const,
    payload: {
      showLiveArena: false,
      renderedChild: 'LiveMatchTrackingPage',
    },
  };

  try {
    reportComponentMountDiagnostics(input, throttle);
    nowMs += 500;
    reportComponentMountDiagnostics(input, throttle);
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 1);
});

test('component mount diagnostics isolates throttles per mounted component instance', () => {
  resetMatchArenaDiagnosticsForTest();
  const originalWarn = console.warn;
  const originalNow = Date.now;
  const firstThrottle = createMatchArenaDiagnosticsThrottle();
  const secondThrottle = createMatchArenaDiagnosticsThrottle();
  const warnings: unknown[][] = [];
  let nowMs = 1000;
  console.warn = (...args: unknown[]) => warnings.push(args);
  Date.now = () => nowMs;

  const input = {
    componentName: 'LiveMatchProgressSection',
    instanceId: 'progress-test',
    mountPhase: 'update' as const,
    payload: {
      matchMode: 'duel',
      includeMatchCards: true,
    },
  };

  try {
    reportComponentMountDiagnostics(input, firstThrottle);
    nowMs += 100;
    reportComponentMountDiagnostics(input, secondThrottle);
  } finally {
    console.warn = originalWarn;
    Date.now = originalNow;
    resetMatchArenaDiagnosticsForTest();
  }

  assert.equal(warnings.length, 2);
});
