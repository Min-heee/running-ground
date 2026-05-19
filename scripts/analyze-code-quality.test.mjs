import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findCalculationPlacementIssues,
  findLocationIssues,
  findTypePlacementIssues,
  isTypeBoundary,
  isUtilityBoundary,
} from './analyze-code-quality.mjs';

function baseMetrics(overrides = {}) {
  return {
    calculationSignalCount: 0,
    isCode: true,
    lines: [],
    locationSignalCount: 0,
    relativePath: 'src/features/example/foo.ts',
    sortFilterMapCount: 0,
    typeDeclarationCount: 0,
    ...overrides,
  };
}

test('isTypeBoundary recognizes explicit type files and existing type boundaries', () => {
  assert.equal(isTypeBoundary('src/foo/types/bar.ts'), true);
  assert.equal(isTypeBoundary('src/features/runs/sync/roomInviteInbox.types.ts'), true);
  assert.equal(isTypeBoundary('src/features/runs/MatchTypes.ts'), true);
  assert.equal(isTypeBoundary('src/features/runs/foo.test.ts'), true);
  assert.equal(isTypeBoundary('src/features/runs/foo.ts'), false);
});

test('isUtilityBoundary recognizes query, service, helper, builder, and mock service boundaries', () => {
  assert.equal(isUtilityBoundary('src/features/runs/utils/foo.ts'), true);
  assert.equal(isUtilityBoundary('src/features/runs/viewModels/foo.ts'), true);
  assert.equal(isUtilityBoundary('src/features/integrations/sourceCatalogQueries.ts'), true);
  assert.equal(isUtilityBoundary('backend/src/services/offlineRaceHub.mjs'), true);
  assert.equal(isUtilityBoundary('backend/src/lib/userStoreHelpers.mjs'), true);
  assert.equal(isUtilityBoundary('backend/src/lib/catalogBuilders.mjs'), true);
  assert.equal(isUtilityBoundary('src/lib/api/services/mock/matchSessions.ts'), true);
  assert.equal(isUtilityBoundary('backend/src/store.mjs'), true);
  assert.equal(isUtilityBoundary('src/components/foo.tsx'), false);
});

test('findTypePlacementIssues skips type boundaries and flags dense app files only', () => {
  assert.deepEqual(findTypePlacementIssues(baseMetrics({
    relativePath: 'src/features/runs/sync/roomInviteInbox.types.ts',
    typeDeclarationCount: 8,
  })), []);
  assert.equal(findTypePlacementIssues(baseMetrics({
    relativePath: 'src/features/runs/runtime/largeHook.ts',
    typeDeclarationCount: 8,
  }))[0]?.priority, 'High');
  assert.deepEqual(findTypePlacementIssues(baseMetrics({
    relativePath: 'src/features/runs/runtime/smallHook.ts',
    typeDeclarationCount: 2,
  })), []);
});

test('findCalculationPlacementIssues skips utility boundaries and flags screen calculations', () => {
  assert.deepEqual(findCalculationPlacementIssues(baseMetrics({
    relativePath: 'backend/src/lib/foo.mjs',
    sortFilterMapCount: 10,
  })), []);
  assert.deepEqual(findCalculationPlacementIssues(baseMetrics({
    relativePath: 'src/features/integrations/sourceCatalogQueries.ts',
    sortFilterMapCount: 10,
  })), []);
  assert.equal(findCalculationPlacementIssues(baseMetrics({
    relativePath: 'src/features/example/screens/HeavyScreen.tsx',
    sortFilterMapCount: 10,
  }))[0]?.priority, 'High');
});

test('findLocationIssues skips analyzer scripts and downgrades AppState-only signals', () => {
  assert.deepEqual(findLocationIssues(baseMetrics({
    lines: ['const pattern = /Location|watchPositionAsync|AppState/;'],
    locationSignalCount: 5,
    relativePath: 'scripts/analyze-code-quality.mjs',
  })), []);
  assert.equal(findLocationIssues(baseMetrics({
    lines: ['import { AppState } from "react-native";'],
    locationSignalCount: 1,
    relativePath: 'src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotForegroundRefresh.ts',
  }))[0]?.priority, 'Medium');
  assert.equal(findLocationIssues(baseMetrics({
    lines: [
      'import { AppState } from "react-native";',
      'const state = AppState.currentState;',
      'AppState.addEventListener("change", listener);',
    ],
    locationSignalCount: 3,
    relativePath: 'src/features/match/hooks/lobby/roomSnapshot/useRoomSnapshotForegroundRefresh.ts',
  }))[0]?.priority, 'Medium');
  assert.equal(findLocationIssues(baseMetrics({
    lines: ['Location.watchPositionAsync();', 'TaskManager.defineTask();', 'AppState.addEventListener();'],
    locationSignalCount: 3,
    relativePath: 'src/features/example/useLocationThing.ts',
  }))[0]?.priority, 'High');
});
