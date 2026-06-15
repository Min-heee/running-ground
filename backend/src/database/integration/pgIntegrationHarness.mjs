// Real-Postgres integration harness.
//
// Stage 2 of the Postgres-primary migration. The repository `postgres*Repository.test.mjs`
// suites run against a hand-rolled in-memory fake, which only proves the JS branching — it
// cannot catch real SQL/schema/constraint mismatches. This module wires the *real* repos to
// a *real* Postgres (via a connection string) so the owner can run high-confidence
// integration assertions. It does NOT require a database to import: callers guard with
// `hasIntegrationDatabaseUrl()` first, so `npm test` (no DB) stays green.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresDatabase } from '../postgresDatabase.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
// src/database/integration -> backend root is three levels up.
const backendDirectory = resolve(currentDirectory, '..', '..', '..');
const schemaPath = resolve(backendDirectory, 'db', 'schema.sql');

// All application tables defined in db/schema.sql. Kept in dependency-free order; `cascade`
// in truncateAll handles the foreign-key graph regardless of ordering.
export const APP_TABLES = [
  'app_metadata',
  'users',
  'sessions',
  'social_accounts',
  'runs',
  'integration_imports',
  'friend_requests',
  'friendships',
  'market_items',
  'reward_redemptions',
  'offline_race_events',
  'offline_race_entries',
  'offline_race_guide_steps',
  'notices',
];

function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// Mirrors scripts/check-postgres.mjs / config.mjs resolution order without importing config.mjs
// (config.mjs throws in non-development release validation, which is undesirable inside a test
// harness). Reads the env directly.
export function resolveIntegrationDatabaseUrl() {
  const raw = process.env.BACKEND_POSTGRES_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

export function hasIntegrationDatabaseUrl() {
  return resolveIntegrationDatabaseUrl().length > 0;
}

export function createIntegrationDatabase() {
  const connectionString = resolveIntegrationDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      'Integration database URL is required. Set BACKEND_POSTGRES_DATABASE_URL or DATABASE_URL.',
    );
  }

  return createPostgresDatabase({
    connectionString,
    ssl: parseBoolean(process.env.BACKEND_POSTGRES_SSL, false),
    maxConnections: Math.max(1, parseNumber(process.env.BACKEND_POSTGRES_POOL_MAX, 5)),
    idleTimeoutMs: Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_IDLE_TIMEOUT_MS, 30000)),
    connectionTimeoutMs: Math.max(1000, parseNumber(process.env.BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS, 10000)),
    applicationName: 'runningground-backend-integration-test',
  });
}

export function readSchemaSql() {
  return readFileSync(schemaPath, 'utf8');
}

// schema.sql uses `create table if not exists` plus `create or replace function` and
// `drop trigger if exists`, so it is safe to run repeatedly. The whole file is wrapped in
// begin/commit; we execute it as one multi-statement query.
export async function applySchema(database) {
  await database.query(readSchemaSql());
}

// Per-test isolation. `restart identity` resets any serial counters; `cascade` clears the FK
// graph in one shot. Truncating every app table keeps tests independent of insertion order.
export async function truncateAll(database) {
  const tableList = APP_TABLES.map((table) => `"${table}"`).join(', ');
  await database.query(`truncate ${tableList} restart identity cascade`);
}
