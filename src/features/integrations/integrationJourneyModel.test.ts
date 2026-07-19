import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectedSource } from '@/domain';
import type { NativeHealthReadiness } from '@/integrations/nativeHealth';
import { buildIntegrationJourneyModel } from './integrationJourneyModel';

function source(overrides: Partial<ConnectedSource> & Pick<ConnectedSource, 'sourceType'>): ConnectedSource {
  return {
    connected: false,
    connectionStatus: 'planned',
    displayName: overrides.sourceType,
    recommendedPlatform: 'all',
    ...overrides,
  };
}

function readiness(
  state: NativeHealthReadiness['state'],
  sourceType: NativeHealthReadiness['sourceType'] = 'health_connect',
): NativeHealthReadiness {
  return {
    sourceType,
    title: '',
    description: '',
    badgeLabel: '',
    state,
    steps: [],
    expectedPlatform: sourceType === 'apple_health' ? 'ios' : 'android',
    connected: true,
  };
}

test('journey model: primary not connected → connect-first copy, no step complete', () => {
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'health_connect', displayName: '헬스 커넥트' }),
      source({ sourceType: 'manual' }),
    ],
    platform: 'android',
    nativeHealthReadiness: null,
  });

  assert.equal(model.headline, 'Android에서는 헬스 커넥트부터 연결하면 돼.');
  assert.equal(model.body, '기본 연동 소스를 먼저 붙여두면 이후 기기 기록 가져오기, 홈 요약까지 한 흐름으로 연결돼.');
  assert.deepEqual(model.steps.map((step) => [step.id, step.complete]), [
    ['primary', false],
    ['import', false],
    ['manual', false],
  ]);
  assert.equal(model.steps[0].description, 'Android에서 가장 먼저 연결할 기본 소스야.');
  assert.equal(model.steps[1].description, '기본 소스를 연결하면 그다음 단계로 넘어갈 수 있어.');
  assert.equal(model.primaryConnected, false);
  assert.equal(model.showImportButton, false);
  assert.equal(model.connectedCount, 0);
});

test('journey model: module absent (build 48) → iOS resolves no primary source', () => {
  // The HealthKit-free build 48 binary has no Apple-Health reader, so even a
  // legacy connected apple_health row must not resolve to a primary source
  // and must never surface the import button. This is the default (no
  // appleHealthAvailable flag) so the OTA'd JS is safe on build 48.
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'apple_health', displayName: 'Apple 건강', connected: true }),
      source({ sourceType: 'manual' }),
    ],
    platform: 'ios',
    nativeHealthReadiness: null,
  });

  assert.equal(model.primarySource, null);
  assert.equal(model.primaryConnected, false);
  assert.equal(model.showImportButton, false);
});

test('journey model: module present (build 49+) → iOS resolves Apple 건강 and offers import', () => {
  // Same sources, same OTA'd JS — but the caller reports the
  // RunnigappAppleHealth module as present, so Apple 건강 is the primary
  // source again and the import flow lights up.
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'apple_health', displayName: 'Apple 건강', connected: true }),
      source({ sourceType: 'manual' }),
    ],
    platform: 'ios',
    nativeHealthReadiness: readiness('config_ready', 'apple_health'),
    appleHealthAvailable: true,
  });

  assert.equal(model.primarySource?.sourceType, 'apple_health');
  assert.equal(model.primaryConnected, true);
  assert.equal(model.showImportButton, true);
  assert.equal(model.headline, 'Apple 건강는 준비됐고, 이제 기기 기록을 가져오면 돼.');
});

test('journey model: primary connected + device readable → import copy and import button', () => {
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'health_connect', displayName: '헬스 커넥트', connected: true }),
      source({ sourceType: 'manual' }),
    ],
    platform: 'android',
    nativeHealthReadiness: readiness('config_ready'),
  });

  assert.equal(model.headline, '헬스 커넥트는 준비됐고, 이제 기기 기록을 가져오면 돼.');
  assert.equal(model.body, "'기기에서 기록 가져오기' 버튼을 누르면 기기에 쌓인 러닝 기록을 바로 가져올 수 있어.");
  assert.deepEqual(model.steps.map((step) => [step.id, step.complete]), [
    ['primary', true],
    ['import', false],
    ['manual', false],
  ]);
  assert.equal(model.steps[1].description, "'기기에서 기록 가져오기' 버튼을 누르면 기기에 쌓인 러닝 기록이 들어와.");
  assert.equal(model.showImportButton, true);
});

test('journey model: primary connected, device not readable, manual open → manual-safety copy', () => {
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'health_connect', displayName: '헬스 커넥트', connected: true, lastSyncedAt: '2026-07-12T00:00:00Z' }),
      source({ sourceType: 'manual', connected: true }),
    ],
    platform: 'android',
    nativeHealthReadiness: readiness('needs_custom_build'),
  });

  assert.equal(model.headline, '연동으로 안 들어온 기록은 수동 기록으로 바로 채울 수 있어.');
  assert.equal(model.body, '가져오기로 안 들어온 날도 직접 입력만 하면 기록이 바로 반영돼.');
  assert.deepEqual(model.steps.map((step) => [step.id, step.complete]), [
    ['primary', true],
    ['import', true],
    ['manual', true],
  ]);
  assert.equal(model.steps[2].title, '수동 입력 준비 완료');
  assert.equal(model.manualConnected, true);
  assert.equal(model.deviceImportCompleted, true);
  assert.equal(model.showImportButton, false);
});

test('journey model: primary connected, device not readable, manual closed → open-safety-net copy', () => {
  const model = buildIntegrationJourneyModel({
    sources: [
      source({ sourceType: 'health_connect', displayName: '헬스 커넥트', connected: true }),
      source({ sourceType: 'manual' }),
    ],
    platform: 'android',
    nativeHealthReadiness: null,
  });

  assert.equal(model.headline, '소스 연결 다음엔 수동 입력 안전망까지 열어두면 든든해.');
  assert.equal(model.body, '가져오기와 별개로 수동 입력 경로를 열어 두면 기록이 빌 일이 없어.');
  assert.deepEqual(model.steps.map((step) => [step.id, step.complete]), [
    ['primary', true],
    ['import', false],
    ['manual', false],
  ]);
  assert.equal(model.steps[2].title, '수동 입력 안전망 열기');
  assert.equal(model.steps[1].description, "연동 관리에서 '기기에서 기록 가져오기' 버튼을 누르면 기록이 들어와.");
});

test('journey model: explicit importEligible overrides display readiness for the button', () => {
  const base = {
    sources: [source({ sourceType: 'health_connect', connected: true })],
    platform: 'android' as const,
  };

  assert.equal(
    buildIntegrationJourneyModel({ ...base, nativeHealthReadiness: null, importEligible: true }).showImportButton,
    true,
  );
  assert.equal(
    buildIntegrationJourneyModel({ ...base, nativeHealthReadiness: readiness('config_ready'), importEligible: false }).showImportButton,
    false,
  );
});
