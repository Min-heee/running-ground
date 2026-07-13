import { Pool } from 'pg';

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildPoolConfig({
  connectionString,
  ssl = false,
  maxConnections = 10,
  idleTimeoutMs = 30000,
  connectionTimeoutMs = 10000,
  applicationName = 'runningground-backend',
  lockTimeoutMs = 8000,
  statementTimeoutMs = 15000,
  idleInTransactionTimeoutMs = 30000,
}) {
  const normalizedConnectionString = normalizeOptionalString(connectionString);

  if (!normalizedConnectionString) {
    throw new Error('PostgreSQL connection string is required.');
  }

  return {
    connectionString: normalizedConnectionString,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: maxConnections,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connectionTimeoutMs,
    application_name: applicationName,
    // 서버측 안전핀 3종. 전체 스토어가 app_store 한 행이라 모든 쓰기가 그 행의 FOR UPDATE 락에
    // 직렬화되는데, 타임아웃이 하나도 없으면 트랜잭션 하나가 락을 문 채 멈추는 순간(네트워크 순단,
    // vacuum에 밀린 대형 UPDATE) 대기자들이 커넥션 풀을 전부 점유해 읽기까지 굶는 전면 장애가 된다.
    // 이 핀들은 그런 요청만 죽이고 서비스는 살린다: 락 대기 8s, 문장 실행 15s(멀쩡할 때 행 쓰기는
    // 수십 ms — 15s를 넘겼다면 이미 사고), 트랜잭션 안 유휴 30s.
    options: `-c lock_timeout=${lockTimeoutMs} -c statement_timeout=${statementTimeoutMs} -c idle_in_transaction_session_timeout=${idleInTransactionTimeoutMs}`,
  };
}

function createTransactionClient(client) {
  return {
    query(sql, params = []) {
      return client.query(sql, params);
    },
  };
}

export function createPostgresDatabase(config, { PoolCtor = Pool } = {}) {
  const pool = new PoolCtor(buildPoolConfig(config));
  let closed = false;

  return {
    async query(sql, params = []) {
      if (closed) {
        throw new Error('PostgreSQL pool is already closed.');
      }

      return pool.query(sql, params);
    },

    async transaction(callback) {
      if (closed) {
        throw new Error('PostgreSQL pool is already closed.');
      }

      const client = await pool.connect();

      try {
        await client.query('begin');
        const result = await callback(createTransactionClient(client));
        await client.query('commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          error.rollbackError = rollbackError;
        }

        throw error;
      } finally {
        client.release();
      }
    },

    async check() {
      if (closed) {
        throw new Error('PostgreSQL pool is already closed.');
      }

      const result = await pool.query(
        `
          select
            current_database() as database_name,
            current_schema() as schema_name,
            current_user as current_user,
            now() as server_time
        `,
      );
      const row = result.rows[0] ?? {};

      return {
        ok: true,
        databaseName: row.database_name ?? '',
        schemaName: row.schema_name ?? '',
        currentUser: row.current_user ?? '',
        serverTime: row.server_time instanceof Date
          ? row.server_time.toISOString()
          : normalizeOptionalString(row.server_time),
      };
    },

    async close() {
      if (closed) {
        return;
      }

      closed = true;
      await pool.end();
    },
  };
}

export { buildPoolConfig };
