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
