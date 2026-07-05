import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The store seam (src/storage/index.mjs) resolves its guards at MODULE LOAD time from env, so we
// exercise it by importing it in a fresh child Node process with a specific env and observing
// whether the import throws. Each case runs `node --input-type=module -e "import(...)"` so the
// module's top-level checks run in isolation (no shared module cache, no PG connection needed for
// the json-driver cases).

const storeIndexUrl = new URL('./index.mjs', import.meta.url);
const storeIndexPath = fileURLToPath(storeIndexUrl);

function importStoreSeamWithEnv(env) {
  // Import via absolute file URL so cwd doesn't matter; print a marker on success.
  const script = `import(${JSON.stringify(storeIndexUrl.href)}).then(() => { console.log('LOADED_OK'); }).catch((error) => { console.error(error.message); process.exit(3); });`;

  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: {
      // Start from a clean slate so the parent test env can't leak a PG URL or driver in.
      PATH: process.env.PATH,
      ...env,
    },
  });
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[storage/index] ok - ${name}`);
  } catch (error) {
    console.error(`[storage/index] failed - ${name}`);
    throw error;
  }
}

await runTest('boots on the json driver when no postgres URL is present', async () => {
  const result = importStoreSeamWithEnv({
    BACKEND_STORE_DRIVER: 'json',
  });

  assert.equal(result.status, 0, `expected clean boot, got status ${result.status}: ${result.stderr}`);
  assert.match(result.stdout, /LOADED_OK/);
});

await runTest('refuses to boot on the json driver when a postgres URL is configured', async () => {
  const result = importStoreSeamWithEnv({
    BACKEND_STORE_DRIVER: 'json',
    BACKEND_POSTGRES_DATABASE_URL: 'postgres://user:pass@localhost:5432/runningground',
  });

  assert.notEqual(result.status, 0, 'expected the json-with-postgres-URL mismatch to throw at boot');
  assert.match(result.stderr, /refusing to boot on the json store/);
  assert.match(result.stderr, /BACKEND_STORE_DRIVER=postgres/);
});

await runTest('also refuses to boot when the postgres URL is provided via DATABASE_URL', async () => {
  const result = importStoreSeamWithEnv({
    BACKEND_STORE_DRIVER: 'json',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/runningground',
  });

  assert.notEqual(result.status, 0, 'expected DATABASE_URL to trip the same guard');
  assert.match(result.stderr, /refusing to boot on the json store/);
});

await runTest('default driver (json) also refuses when a postgres URL is present', async () => {
  // BACKEND_STORE_DRIVER unset → defaults to 'json'; the compose footgun this guard protects.
  const result = importStoreSeamWithEnv({
    BACKEND_POSTGRES_DATABASE_URL: 'postgres://user:pass@localhost:5432/runningground',
  });

  assert.notEqual(result.status, 0, 'expected the default json driver to refuse a configured postgres URL');
  assert.match(result.stderr, /refusing to boot on the json store/);
});

await runTest('still rejects an unsupported driver value', async () => {
  const result = importStoreSeamWithEnv({
    BACKEND_STORE_DRIVER: 'mysql',
  });

  assert.notEqual(result.status, 0, 'expected an unsupported driver to throw');
  assert.match(result.stderr, /Unsupported BACKEND_STORE_DRIVER/);
});

console.log(`[storage/index] all tests passed (${storeIndexPath})`);
