import assert from 'node:assert/strict';
import { buildPoolConfig, createPostgresDatabase } from './postgresDatabase.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeClient {
  constructor(pool) {
    this.pool = pool;
    this.released = false;
  }

  async query(sql, params = []) {
    this.pool.clientQueries.push({
      sql: String(sql).trim().toLowerCase(),
      params,
    });

    if (this.pool.failOnQuery && String(sql).trim().toLowerCase() === this.pool.failOnQuery) {
      throw new Error(`client query failed: ${this.pool.failOnQuery}`);
    }

    return { rows: [] };
  }

  release() {
    this.released = true;
    this.pool.releaseCount += 1;
  }
}

class FakePool {
  constructor(config) {
    this.config = config;
    this.queries = [];
    this.clientQueries = [];
    this.releaseCount = 0;
    this.endCount = 0;
    this.connectCount = 0;
    this.failOnPoolQuery = '';
    this.failOnQuery = '';
    this.nextQueryRows = [];
  }

  async query(sql, params = []) {
    const normalizedSql = String(sql).trim().toLowerCase();
    this.queries.push({
      sql: normalizedSql,
      params,
    });

    if (this.failOnPoolQuery && normalizedSql === this.failOnPoolQuery) {
      throw new Error(`pool query failed: ${this.failOnPoolQuery}`);
    }

    return {
      rows: this.nextQueryRows,
    };
  }

  async connect() {
    this.connectCount += 1;
    return new FakeClient(this);
  }

  async end() {
    this.endCount += 1;
  }
}

function createDatabaseHarness(options = {}) {
  let lastPool = null;

  class HarnessPool extends FakePool {
    constructor(config) {
      super(config);
      lastPool = this;

      if (options.nextQueryRows) {
        this.nextQueryRows = clone(options.nextQueryRows);
      }
    }
  }

  return {
    database: createPostgresDatabase({
      connectionString: 'postgres://runner:secret@localhost:5432/runnigapp_preview',
      ...options.config,
    }, { PoolCtor: HarnessPool }),
    getPool() {
      return lastPool;
    },
  };
}

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[postgresDatabase] ok - ${name}`);
  } catch (error) {
    console.error(`[postgresDatabase] failed - ${name}`);
    throw error;
  }
}

await runTest('builds pool config from connection settings', async () => {
  const config = buildPoolConfig({
    connectionString: 'postgres://runner:secret@localhost:5432/runnigapp_preview',
    ssl: true,
    maxConnections: 12,
    idleTimeoutMs: 45000,
    connectionTimeoutMs: 9000,
    applicationName: 'runnigapp-preview',
  });

  assert.equal(config.connectionString, 'postgres://runner:secret@localhost:5432/runnigapp_preview');
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(config.max, 12);
  assert.equal(config.idleTimeoutMillis, 45000);
  assert.equal(config.connectionTimeoutMillis, 9000);
  assert.equal(config.application_name, 'runnigapp-preview');
});

await runTest('runs direct queries through the pool', async () => {
  const { database, getPool } = createDatabaseHarness();

  await database.query('select 1 as ok', []);

  assert.deepEqual(getPool().queries, [{
    sql: 'select 1 as ok',
    params: [],
  }]);
  await database.close();
});

await runTest('wraps transactions with begin and commit', async () => {
  let callbackRan = false;
  const { database, getPool } = createDatabaseHarness();

  const result = await database.transaction(async (client) => {
    callbackRan = true;
    await client.query('insert into test_table values ($1)', ['value']);
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(callbackRan, true);
  assert.deepEqual(getPool().clientQueries, [
    { sql: 'begin', params: [] },
    { sql: 'insert into test_table values ($1)', params: ['value'] },
    { sql: 'commit', params: [] },
  ]);
  assert.equal(getPool().releaseCount, 1);
  await database.close();
});

await runTest('rolls back failed transactions and rethrows the error', async () => {
  const { database, getPool } = createDatabaseHarness();

  await assert.rejects(() => database.transaction(async (client) => {
    await client.query('insert into test_table values ($1)', ['value']);
    throw new Error('boom');
  }), {
    message: 'boom',
  });

  assert.deepEqual(getPool().clientQueries, [
    { sql: 'begin', params: [] },
    { sql: 'insert into test_table values ($1)', params: ['value'] },
    { sql: 'rollback', params: [] },
  ]);
  assert.equal(getPool().releaseCount, 1);

  await database.close();
});

await runTest('checks connection metadata with a lightweight select', async () => {
  const { database, getPool } = createDatabaseHarness({
    nextQueryRows: [{
      database_name: 'runnigapp_preview',
      schema_name: 'public',
      current_user: 'runnigapp',
      server_time: '2026-04-24T01:00:00.000Z',
    }],
  });

  const result = await database.check();

  assert.deepEqual(result, {
    ok: true,
    databaseName: 'runnigapp_preview',
    schemaName: 'public',
    currentUser: 'runnigapp',
    serverTime: '2026-04-24T01:00:00.000Z',
  });
  assert.equal(getPool().queries.length, 1);

  await database.close();
});

await runTest('closes the pool idempotently', async () => {
  const { database, getPool } = createDatabaseHarness();

  await database.close();
  await database.close();
  assert.equal(getPool().endCount, 1);

  await assert.rejects(() => database.query('select 1'), {
    message: 'PostgreSQL pool is already closed.',
  });
});
