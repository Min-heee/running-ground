import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const currentFilePath = fileURLToPath(import.meta.url);
const sourceDirectory = dirname(currentFilePath);
const backendDirectory = resolve(sourceDirectory, '..');
const storeFile = join(backendDirectory, 'data', 'smoke-store.json');
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

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${pathname}: ${payload?.message ?? text}`);
  }

  return payload;
}

async function main() {
  if (existsSync(storeFile)) {
    rmSync(storeFile);
  }

  const serverProcess = spawn(process.execPath, ['./src/server.mjs'], {
    cwd: backendDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      BACKEND_STORE_FILE: storeFile,
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

    const registered = await request('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'smoke-user',
        password: 'smoke-pass',
        name: '스모크 유저',
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
    assert(registered.user.universityName === '스모크대학교', '회원가입 대학 정보가 저장되지 않았어.');
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
    assert(profile.name === '스모크 유저', '프로필 이름이 예상과 달라.');

    const updatedProfile = await request('/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: '스모크 유저 수정',
        universityName: '스모크대학교2',
      }),
    });
    assert(updatedProfile.name === '스모크 유저 수정', '프로필 이름 수정이 반영되지 않았어.');
    assert(updatedProfile.universityName === '스모크대학교2', '프로필 대학 수정이 반영되지 않았어.');
    logStep('profile update flow ok');

    const universityLeague = await request('/league/universities', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(Array.isArray(universityLeague.ranks), '대학 리그 응답 형식이 올바르지 않아.');
    assert(universityLeague.ranks.some((entry) => entry.universityName === '스모크대학교2'), '수정한 대학이 대학 리그에 반영되지 않았어.');
    logStep('university league flow ok');

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
    assert(adminStatus.counts.users >= 9, '관리자 상태 카운트가 예상보다 작아.');
    logStep('admin status ok');

    const adminReset = await request('/admin/reset', {
      method: 'POST',
      headers: {
        'X-Admin-Token': adminToken,
      },
    });
    assert(adminReset.success === true, '관리자 리셋이 성공하지 않았어.');
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
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
