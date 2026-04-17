import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildUserRunMetrics, getRunPointValue } from './points.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const sourceDirectory = dirname(currentFilePath);
const backendDirectory = resolve(sourceDirectory, '..');
const storeFile = join(backendDirectory, 'data', 'smoke-store.json');
const backupDirectory = join(backendDirectory, 'data', 'smoke-backups');
const port = 8093;
const baseUrl = `http://127.0.0.1:${port}/api`;
const adminToken = 'smoke-admin-token';

function logStep(message) {
  console.log(`[smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listBackupFiles() {
  if (!existsSync(backupDirectory)) {
    return [];
  }

  return readdirSync(backupDirectory).filter((entry) => entry.endsWith('.json'));
}

function formatDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }

  throw new Error('백엔드 스모크 서버가 제시간에 올라오지 않았어.');
}

async function request(pathname, { expectedStatuses = [200], ...fetchOptions } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, fetchOptions);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const expectedStatusList = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];

  if (!expectedStatusList.includes(response.status)) {
    throw new Error(`Request failed ${response.status} ${pathname}: ${payload?.message ?? text}`);
  }

  return payload;
}

async function main() {
  if (existsSync(storeFile)) {
    rmSync(storeFile);
  }

  if (existsSync(backupDirectory)) {
    rmSync(backupDirectory, { recursive: true, force: true });
  }

  const serverProcess = spawn(process.execPath, ['./src/server.mjs'], {
    cwd: backendDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      BACKEND_STORE_FILE: storeFile,
      BACKEND_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      BACKEND_CORS_ORIGIN: 'http://localhost:8089,http://127.0.0.1:8089',
      BACKEND_STORE_BACKUP_DIRECTORY: backupDirectory,
      BACKEND_STORE_BACKUP_ON_SAVE: 'true',
      BACKEND_STORE_BACKUP_RETENTION: '5',
      BACKEND_ADMIN_TOKEN: adminToken,
      BACKEND_ENABLE_ADMIN_STATUS: 'true',
      BACKEND_ENABLE_RESET_ENDPOINT: 'true',
    },
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(String(chunk));
  });

  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk));
  });

  try {
    await waitForServer(`${baseUrl}/health`);
    logStep('health endpoint ready');

    const health = await request('/health');
    assert(health.status === 'ok', 'health 응답 상태가 올바르지 않아.');
    assert(health.ready === true, 'health 응답 ready 값이 빠졌어.');
    assert(health.environment === 'development', 'health 응답 환경 값이 예상과 달라.');
    assert(health.publicBaseUrl === `http://127.0.0.1:${port}`, 'health 응답 공개 주소가 반영되지 않았어.');
    assert(Array.isArray(health.config.corsOrigins) && health.config.corsOrigins.length === 2, 'health 응답 CORS 목록이 올바르지 않아.');
    assert(health.config.maxBodySizeKb === 256, 'health 응답 최대 본문 크기가 예상과 달라.');
    assert(health.config.storeWriteMode === 'atomic', 'health 응답 저장 방식이 원자적 저장으로 내려오지 않았어.');
    assert(health.config.storeBackupOnSave === true, 'health 응답 자동 백업 설정이 반영되지 않았어.');
    assert(health.config.storeBackupRetention === 5, 'health 응답 백업 보관 개수가 예상과 달라.');

    const seededStoreContents = readFileSync(storeFile, 'utf8');
    assert(!seededStoreContents.includes('"password":'), '초기 저장소에 평문 비밀번호가 남아 있어.');
    assert(seededStoreContents.includes('"users": []'), '초기 저장소가 빈 상태로 시작하지 않았어.');

    const availableUsername = await request('/auth/check-username?username=smoke-user');
    assert(availableUsername.available === true, '신규 아이디가 사용 가능으로 내려오지 않았어.');
    logStep('username availability flow ok');

    const registered = await request('/auth/register', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'smoke-user',
        password: 'smoke-pass',
        nickname: '스모크러너',
        realName: '스모크 유저',
        phone: '01099998888',
        provinceName: '서울특별시',
        cityName: '',
        districtName: '강남구',
        universityName: '스모크대학교',
        addressDetail: '테스트로 100',
        birthDate: '1999-12-31',
      }),
    });
    assert(typeof registered.accessToken === 'string', '회원가입 토큰이 비어 있어.');
    assert(registered.user.name === '스모크러너', '회원가입 닉네임이 공개 프로필에 반영되지 않았어.');
    assert(registered.user.universityName === '스모크대학교', '회원가입 대학 정보가 저장되지 않았어.');
    const storeAfterRegister = readFileSync(storeFile, 'utf8');
    assert(storeAfterRegister.includes('"expiresAt":'), '세션 만료 시간이 저장되지 않았어.');
    assert(storeAfterRegister.includes('"realName": "스모크 유저"'), '비공개 이름이 저장되지 않았어.');
    assert(storeAfterRegister.includes('"passwordHash":'), '회원가입 후에도 비밀번호 해시가 저장되지 않았어.');
    assert(listBackupFiles().length >= 1, '자동 백업이 저장 전 상태를 남기지 않았어.');

    const takenUsername = await request('/auth/check-username?username=smoke-user');
    assert(takenUsername.available === false, '방금 가입한 아이디가 사용 중으로 내려오지 않았어.');
    logStep('register flow ok');

    const loggedIn = await request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'smoke-user',
        password: 'smoke-pass',
      }),
    });
    const accessToken = loggedIn.accessToken;
    assert(typeof accessToken === 'string', '로그인 토큰이 비어 있어.');
    logStep('login flow ok');

    const profile = await request('/me/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(profile.name === '스모크러너', '프로필 닉네임이 예상과 달라.');
    assert(profile.realName === undefined, '비공개 이름이 프로필 응답에 노출되면 안 돼.');
    assert(profile.provinceName === '서울특별시', '프로필 시/도 정보가 예상과 달라.');

    const updatedProfile = await request('/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '스모크캡틴',
        universityName: '스모크대학교2',
      }),
    });
    assert(updatedProfile.name === '스모크캡틴', '프로필 닉네임 수정이 반영되지 않았어.');
    assert(updatedProfile.universityName === '스모크대학교2', '프로필 대학 수정이 반영되지 않았어.');

    const regionCatalog = await request('/catalog/regions');
    assert(Array.isArray(regionCatalog.regions) && regionCatalog.regions.length > 0, '지역 카탈로그가 비어 있어.');
    assert(regionCatalog.regions.some((region) => region.name === '서울특별시'), '서울특별시가 지역 카탈로그에 없어.');

    const universityCatalog = await request('/catalog/universities');
    assert(Array.isArray(universityCatalog.universities), '대학 카탈로그 형식이 올바르지 않아.');
    assert(universityCatalog.universities.includes('스모크대학교2'), '수정한 대학이 대학 카탈로그에 반영되지 않았어.');

    const updatedRegion = await request('/me/region', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provinceName: '서울특별시',
        cityName: '',
        districtName: '중구',
      }),
    });
    assert(updatedRegion.provinceName === '서울특별시', '지역 수정 후 시/도 정보가 반영되지 않았어.');
    assert(updatedRegion.cityName === undefined, '서울특별시는 cityName 없이 저장되어야 해.');
    assert(updatedRegion.districtName === '중구', '지역 수정 후 최종 지역이 반영되지 않았어.');
    logStep('profile update flow ok');

    const today = new Date();
    const manualRunInputs = [
      {
        date: formatDate(addDays(today, -2)),
        distanceKm: 4.2,
        pace: '05:40/km',
      },
      {
        date: formatDate(addDays(today, -1)),
        distanceKm: 6.1,
        pace: '05:30/km',
      },
    ];

    const firstRun = await request('/runs/manual', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(manualRunInputs[0]),
    });

    const secondRun = await request('/runs/manual', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(manualRunInputs[1]),
    });

    const expectedMetrics = buildUserRunMetrics([
      {
        id: firstRun.run.id,
        userId: 'smoke-user',
        date: manualRunInputs[0].date,
        distanceKm: manualRunInputs[0].distanceKm,
        pace: manualRunInputs[0].pace,
        source: 'Manual',
      },
      {
        id: secondRun.run.id,
        userId: 'smoke-user',
        date: manualRunInputs[1].date,
        distanceKm: manualRunInputs[1].distanceKm,
        pace: manualRunInputs[1].pace,
        source: 'Manual',
      },
    ]);
    assert(firstRun.run.source === 'Manual', '수동 기록 소스가 Manual로 저장되지 않았어.');
    assert(firstRun.earnedPoint === getRunPointValue(expectedMetrics, firstRun.run.id), '첫 수동 기록 포인트가 예상과 달라.');
    assert(secondRun.earnedPoint === getRunPointValue(expectedMetrics, secondRun.run.id), '두 번째 수동 기록 포인트가 예상과 달라.');

    const refreshedProfile = await request('/me/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(refreshedProfile.lifetimeDistanceKm === expectedMetrics.lifetimeDistanceKm, '프로필 누적 거리가 수동 기록 뒤에도 갱신되지 않았어.');

    const homeSummary = await request('/home/summary', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(homeSummary.totalDistanceKm === expectedMetrics.currentWeekDistanceKm, '홈 이번 주 거리가 포인트 계산과 맞지 않아.');
    assert(homeSummary.totalRuns === expectedMetrics.currentWeekRunCount, '홈 이번 주 러닝 횟수가 예상과 달라.');
    assert(homeSummary.previousWeekDistanceKm === expectedMetrics.previousWeekDistanceKm, '홈 저번 주 거리가 예상과 달라.');
    assert(homeSummary.streakDays === expectedMetrics.currentStreakDays, '홈 연속 러닝 일수가 예상과 달라.');
    assert(homeSummary.districtPoints === expectedMetrics.currentWeekPoints, '홈 포인트가 주간 계산과 맞지 않아.');

    const myActivity = await request('/me/activity', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(myActivity.runs.length === 2, '수동 기록이 내 활동 목록에 2건 반영되지 않았어.');
    assert(myActivity.monthlyDistanceKm === expectedMetrics.currentMonthDistanceKm, '내 활동 월간 거리가 예상과 달라.');
    assert(myActivity.monthlyPoints === expectedMetrics.currentMonthPoints, '내 활동 월간 포인트가 예상과 달라.');

    const latestRunDetail = await request(`/runs/${secondRun.run.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(latestRunDetail.weeklyDistanceKm === expectedMetrics.currentWeekDistanceKm, '러닝 상세 주간 누적 거리가 예상과 달라.');
    assert(latestRunDetail.earnedPoint === getRunPointValue(expectedMetrics, secondRun.run.id), '러닝 상세 포인트가 예상과 달라.');
    logStep('manual run and point flow ok');

    const regionLeague = await request('/league/regions', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(regionLeague.currentNode?.name, '지역 리그 현재 노드가 비어 있어.');
    assert(Array.isArray(regionLeague.children), '지역 리그 하위 지역 목록이 비어 있어.');

    const districtPersonal = await request('/league/district-personal', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(districtPersonal.districtName === '중구', '구 내 개인 경쟁 지역이 예상과 달라.');
    assert(districtPersonal.weeklyDistanceKm === expectedMetrics.currentWeekDistanceKm, '구 내 개인 경쟁 주간 거리가 예상과 달라.');
    assert(districtPersonal.myPoints === expectedMetrics.currentWeekPoints, '구 내 개인 경쟁 포인트가 예상과 달라.');
    logStep('league flow ok');

    const universityLeague = await request('/league/universities', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(Array.isArray(universityLeague.ranks), '대학 리그 응답 형식이 올바르지 않아.');
    assert(universityLeague.ranks.some((entry) => entry.universityName === '스모크대학교2'), '수정한 대학이 대학 리그에 반영되지 않았어.');
    assert(universityLeague.ranks.some((entry) => entry.universityName === '스모크대학교2' && entry.totalDistanceKm === expectedMetrics.currentWeekDistanceKm), '대학 리그 거리가 이번 주 기준으로 집계되지 않았어.');
    logStep('university league flow ok');

    const integrationSources = await request('/integrations/sources', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(Array.isArray(integrationSources.sources), '연동 소스 목록이 비어 있어.');
    assert(integrationSources.sources.some((entry) => entry.sourceType === 'health_connect'), 'Health Connect 소스를 찾지 못했어.');
    assert(integrationSources.sources.some((entry) => entry.sourceType === 'manual' && entry.connected === true), '수동 기록 추가 후 Manual 소스가 연결 상태로 바뀌지 않았어.');

    const connectedSourceResult = await request('/integrations/sources/health_connect/connect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(connectedSourceResult.source.connected === true, '연동 연결이 반영되지 않았어.');

    const importedRunInputs = [
      {
        externalId: 'hc-run-1',
        date: formatDate(addDays(today, -2)),
        distanceKm: 5.5,
        pace: '05:20/km',
      },
      {
        externalId: 'hc-run-2',
        date: formatDate(addDays(today, -1)),
        distanceKm: 7.3,
        pace: '05:10/km',
      },
    ];

    const queuedImportResult = await request('/integrations/sources/health_connect/import', {
      expectedStatuses: [202],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runs: importedRunInputs,
      }),
    });
    assert(queuedImportResult.queuedRuns === 2, '연동 import 큐 적재 개수가 예상과 달라.');
    assert(queuedImportResult.pendingRuns === 2, '연동 import 대기 개수가 예상과 달라.');

    const integrationSourcesWithPending = await request('/integrations/sources', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(
      integrationSourcesWithPending.sources.some((entry) => entry.sourceType === 'health_connect' && entry.pendingImportCount === 2),
      '연동 대기 import 개수가 소스 상태에 반영되지 않았어.',
    );

    const syncResult = await request('/integrations/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(syncResult.syncedSources >= 1, '연동 동기화 결과가 예상보다 작아.');
    assert(syncResult.scannedRuns === 2, '연동 동기화에서 확인한 기록 수가 예상과 달라.');
    assert(syncResult.importedRuns === 2, '연동 동기화에서 새로 저장한 기록 수가 예상과 달라.');
    assert(syncResult.duplicateRuns === 0, '첫 연동 동기화에서 중복 기록이 나오면 안 돼.');

    const expectedMetricsAfterImport = buildUserRunMetrics([
      {
        id: firstRun.run.id,
        userId: 'smoke-user',
        date: manualRunInputs[0].date,
        distanceKm: manualRunInputs[0].distanceKm,
        pace: manualRunInputs[0].pace,
        source: 'Manual',
      },
      {
        id: secondRun.run.id,
        userId: 'smoke-user',
        date: manualRunInputs[1].date,
        distanceKm: manualRunInputs[1].distanceKm,
        pace: manualRunInputs[1].pace,
        source: 'Manual',
      },
      {
        id: syncResult.importedRunIds[0],
        userId: 'smoke-user',
        date: importedRunInputs[0].date,
        distanceKm: importedRunInputs[0].distanceKm,
        pace: importedRunInputs[0].pace,
        source: 'Health Connect',
      },
      {
        id: syncResult.importedRunIds[1],
        userId: 'smoke-user',
        date: importedRunInputs[1].date,
        distanceKm: importedRunInputs[1].distanceKm,
        pace: importedRunInputs[1].pace,
        source: 'Health Connect',
      },
    ]);

    const activityAfterImport = await request('/me/activity', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(activityAfterImport.runs.length === 4, '연동 기록이 내 활동 목록에 합쳐지지 않았어.');
    assert(activityAfterImport.monthlyDistanceKm === expectedMetricsAfterImport.currentMonthDistanceKm, '연동 후 월간 거리 합계가 예상과 달라.');
    assert(activityAfterImport.monthlyPoints === expectedMetricsAfterImport.currentMonthPoints, '연동 후 월간 포인트 합계가 예상과 달라.');

    const duplicateImportResult = await request('/integrations/sources/health_connect/import', {
      expectedStatuses: [202],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runs: importedRunInputs,
      }),
    });
    assert(duplicateImportResult.pendingRuns === 2, '중복 import도 일단 대기열에는 올라가야 해.');

    const duplicateSyncResult = await request('/integrations/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(duplicateSyncResult.importedRuns === 0, '중복 import는 새 기록으로 저장되면 안 돼.');
    assert(duplicateSyncResult.duplicateRuns === 2, '중복 import 개수가 예상과 달라.');

    const integrationSourcesAfterSync = await request('/integrations/sources', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(
      integrationSourcesAfterSync.sources.every((entry) => entry.pendingImportCount === undefined),
      '동기화 후 처리된 import 대기열이 남아 있으면 안 돼.',
    );

    const disconnectedSourceResult = await request('/integrations/sources/health_connect/disconnect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(disconnectedSourceResult.source.connected === false, '연동 해제가 반영되지 않았어.');
    logStep('integration flow ok');

    const marketOverview = await request('/market/overview', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(Array.isArray(marketOverview.items), '마켓 아이템 목록이 비어 있어.');
    assert(marketOverview.items.length === 0, '빈 마켓 상태가 반영되지 않았어.');
    assert(marketOverview.currentPoints === expectedMetricsAfterImport.totalEarnedPoints, '마켓 현재 포인트가 적립 포인트와 맞지 않아.');

    const missingMarketClaim = await request('/market/items/reward-coupon-coffee/claim', {
      expectedStatuses: [404],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(typeof missingMarketClaim.message === 'string', '없는 마켓 아이템 요청이 올바르게 실패하지 않았어.');
    logStep('market flow ok');

    const offlineRaceHub = await request('/offline-races/hub', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(offlineRaceHub.featuredEvent === null, '레이스 허브 대표 회차가 비어 있어야 해.');
    assert(Array.isArray(offlineRaceHub.upcomingEvents) && offlineRaceHub.upcomingEvents.length === 0, '레이스 허브 일정이 비어 있지 않아.');
    logStep('offline race hub flow ok');

    const secondRegistered = await request('/auth/register', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'friend-user',
        password: 'friend-pass',
        nickname: '프렌드러너',
        realName: '친구 유저',
        phone: '01011112222',
        provinceName: '부산광역시',
        cityName: '',
        districtName: '중구',
        universityName: '',
        addressDetail: '테스트로 200',
        birthDate: '1998-05-05',
      }),
    });
    const receiverToken = secondRegistered.accessToken;
    const receiverTag = secondRegistered.user.publicTag;

    const friendRequest = await request('/friends/requests', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag: receiverTag,
      }),
    });
    assert(friendRequest.status === 'pending', '친구 요청 생성이 반영되지 않았어.');

    const acceptedRequest = await request(`/friends/requests/${friendRequest.requestId}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${receiverToken}`,
      },
    });
    assert(acceptedRequest.status === 'accepted', '친구 요청 수락이 반영되지 않았어.');

    const receiverLogout = await request('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${receiverToken}`,
      },
    });
    assert(receiverLogout.success === true, '상대 사용자 로그아웃이 실패했어.');

    const friendLeaderboard = await request('/friends/leaderboard', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(friendLeaderboard.ranks.some((entry) => entry.tag === receiverTag), '수락된 친구가 랭킹에 반영되지 않았어.');

    const friendId = secondRegistered.user.publicTag
      ? JSON.parse(readFileSync(storeFile, 'utf8')).users.find((entry) => entry.publicTag === receiverTag)?.id
      : null;
    assert(typeof friendId === 'string', '두 번째 사용자 ID를 찾지 못했어.');

    const friendActivity = await request(`/friends/${friendId}/activity`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(Array.isArray(friendActivity.runs) && friendActivity.runs.length === 0, '친구 활동 기록이 빈 상태로 유지되지 않았어.');

    const districtPersonalAfterFriend = await request('/league/district-personal', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(districtPersonalAfterFriend.ranks.length === 1, '동명이 다른 지역 사용자가 구 내 개인 경쟁에 섞이면 안 돼.');
    logStep('friend flow ok');

    const logoutResult = await request('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(logoutResult.success === true, '로그아웃 응답이 올바르지 않아.');

    let unauthorizedCaught = false;

    try {
      await request('/me/profile', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      unauthorizedCaught = true;
    }

    assert(unauthorizedCaught, '로그아웃 후에도 보호 API에 접근할 수 있어.');
    logStep('logout invalidation ok');

    const adminStatus = await request('/admin/status', {
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminStatus.counts.users === 2, '관리자 상태 사용자 수가 예상과 달라.');
    logStep('admin status ok');

    const adminSession = await request('/admin/session', {
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminSession.success === true, '관리자 세션 확인이 성공하지 않았어.');
    assert(adminSession.environment === 'development', '관리자 세션 환경 값이 예상과 달라.');

    const adminOverview = await request('/admin/overview', {
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminOverview.counts.users === 2, '관리자 개요 사용자 수가 예상과 달라.');
    assert(adminOverview.counts.notices === 0, '초기 공지 수는 0이어야 해.');

    const adminUsers = await request('/admin/users', {
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminUsers.users.length === 2, '관리자 회원 목록 사용자 수가 예상과 달라.');

    const createdAdminNotice = await request('/admin/notices', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '이번 주 점검 안내',
        message: '토요일 오전 2시에 서버 점검이 있어요.',
        priority: 3,
        isActive: true,
      }),
    });
    assert(createdAdminNotice.item.title === '이번 주 점검 안내', '관리자 공지 추가가 반영되지 않았어.');

    const activeNotices = await request('/notices/active');
    assert(activeNotices.items.length === 1, '활성 공지 목록 개수가 예상과 달라.');
    assert(activeNotices.items[0].title === '이번 주 점검 안내', '활성 공지 제목이 예상과 달라.');

    const updatedAdminNotice = await request(`/admin/notices/${createdAdminNotice.item.id}`, {
      method: 'PATCH',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '이번 주 점검 시간 변경',
        message: '토요일 오전 3시에 서버 점검이 있어요.',
        priority: 5,
        isActive: true,
      }),
    });
    assert(updatedAdminNotice.item.priority === 5, '관리자 공지 수정이 반영되지 않았어.');

    const deletedAdminNotices = await request(`/admin/notices/${createdAdminNotice.item.id}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(deletedAdminNotices.items.length === 0, '관리자 공지 삭제가 반영되지 않았어.');

    const createdAdminMarketItem = await request('/admin/market/items', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '스모크 상품',
        category: '테스트',
        description: '관리자 상품 추가 테스트용',
        costPoints: 5,
        partnerName: '스모크 파트너',
        repeatable: false,
        isActive: true,
        inventoryCount: 25,
      }),
    });
    assert(createdAdminMarketItem.item.title === '스모크 상품', '관리자 상품 추가가 반영되지 않았어.');
    assert(createdAdminMarketItem.item.remainingStock === 25, '관리자 상품 재고가 예상과 달라.');

    const renewedLogin = await request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'smoke-user',
        password: 'smoke-pass',
      }),
    });
    const renewedAccessToken = renewedLogin.accessToken;

    const claimedAdminMarketItem = await request(`/market/items/${createdAdminMarketItem.item.id}/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${renewedAccessToken}`,
      },
    });
    assert(claimedAdminMarketItem.success === true, '관리자 생성 상품 교환이 실패했어.');

    const adminRewardRedemptions = await request('/admin/reward-redemptions', {
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminRewardRedemptions.items.length === 1, '관리자 교환 목록 개수가 예상과 달라.');
    assert(adminRewardRedemptions.items[0].status === 'requested', '새 교환 요청 상태는 requested 여야 해.');

    const updatedAdminRewardRedemption = await request(`/admin/reward-redemptions/${adminRewardRedemptions.items[0].id}`, {
      method: 'PATCH',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'fulfilled',
        adminNote: '발송 완료',
      }),
    });
    assert(updatedAdminRewardRedemption.item.status === 'fulfilled', '관리자 교환 상태 수정이 반영되지 않았어.');
    assert(updatedAdminRewardRedemption.item.adminNote === '발송 완료', '관리자 교환 메모가 저장되지 않았어.');

    const updatedAdminMarketItem = await request(`/admin/market/items/${createdAdminMarketItem.item.id}`, {
      method: 'PATCH',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '스모크 상품 수정',
        category: '테스트',
        description: '관리자 상품 수정 테스트용',
        costPoints: 8,
        partnerName: '스모크 파트너',
        repeatable: true,
        isActive: false,
        inventoryCount: 20,
      }),
    });
    assert(updatedAdminMarketItem.item.title === '스모크 상품 수정', '관리자 상품 수정이 반영되지 않았어.');
    assert(updatedAdminMarketItem.item.isActive === false, '관리자 상품 활성 상태 수정이 반영되지 않았어.');

    const deletedAdminMarketItems = await request(`/admin/market/items/${createdAdminMarketItem.item.id}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(
      deletedAdminMarketItems.items.every((item) => item.id !== createdAdminMarketItem.item.id),
      '관리자 상품 삭제가 반영되지 않았어.',
    );

    const createdAdminRaceEvent = await request('/admin/offline-races/events', {
      expectedStatuses: [201],
      method: 'POST',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '스모크 레이스',
        subtitle: '관리자 레이스 추가 테스트',
        distanceKm: 10,
        startsAt: '2026-05-01T20:00',
        registrationClosesAt: '2026-05-01T19:00',
        participationMode: '각자 러닝 후 기록 제출',
        proofMethod: '연동 기록 제출',
        runWindowMinutes: 180,
        hostLabel: 'RUNNIGAPP',
        capacity: 80,
        entryFeePoints: 0,
        operationNote: '관리자 레이스 테스트 메모',
      }),
    });
    assert(createdAdminRaceEvent.event.title === '스모크 레이스', '관리자 레이스 추가가 반영되지 않았어.');
    assert(createdAdminRaceEvent.event.participantCount === 0, '새 레이스 참가자 수는 0이어야 해.');

    const updatedAdminRaceEvent = await request(`/admin/offline-races/events/${createdAdminRaceEvent.event.id}`, {
      method: 'PATCH',
      headers: {
        'X-Admin-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '스모크 레이스 수정',
        subtitle: '관리자 레이스 수정 테스트',
        distanceKm: 15,
        startsAt: '2026-05-02T21:00',
        registrationClosesAt: '2026-05-02T20:00',
        participationMode: '자율 집결 없이 각자 출발',
        proofMethod: '앱 기록 인증',
        runWindowMinutes: 240,
        hostLabel: 'RUNNIGAPP',
        capacity: 120,
        entryFeePoints: 10,
        operationNote: '관리자 레이스 수정 메모',
      }),
    });
    assert(updatedAdminRaceEvent.event.distanceKm === 15, '관리자 레이스 수정이 반영되지 않았어.');
    assert(updatedAdminRaceEvent.event.capacity === 120, '관리자 레이스 정원 수정이 반영되지 않았어.');

    const deletedAdminRaceEvents = await request(`/admin/offline-races/events/${createdAdminRaceEvent.event.id}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(
      deletedAdminRaceEvents.events.every((event) => event.id !== createdAdminRaceEvent.event.id),
      '관리자 레이스 삭제가 반영되지 않았어.',
    );

    const deletedAdminUser = await request(`/admin/users/${friendId}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(deletedAdminUser.deletedUserId === friendId, '관리자 회원 삭제 응답이 올바르지 않아.');
    assert(deletedAdminUser.users.length === 1, '관리자 회원 삭제 후 사용자 수가 예상과 달라.');
    logStep('admin crud ok');

    const adminReset = await request('/admin/reset', {
      method: 'POST',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminReset.success === true, '관리자 리셋이 성공하지 않았어.');
    assert(adminReset.counts.users === 0, '리셋 후 기본 사용자 수가 비워지지 않았어.');
    logStep('admin reset ok');

    console.log('[smoke] all checks passed');
  } finally {
    serverProcess.kill('SIGINT');

    await new Promise((resolveExit) => {
      serverProcess.once('exit', () => resolveExit());
      setTimeout(() => resolveExit(), 1500);
    });

    if (existsSync(storeFile)) {
      rmSync(storeFile);
    }

    if (existsSync(backupDirectory)) {
      rmSync(backupDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
