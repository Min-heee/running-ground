import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultStoreFile = resolve(backendDirectory, 'data', 'store.json');
const defaultOutputDirectory = resolve(backendDirectory, 'db', 'generated');

const SOURCE_LABEL_BY_TYPE = {
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  garmin: 'Garmin',
  strava: 'Strava',
  nrc: 'Nike Run Club',
  runnigapp: 'RUNNIGAPP',
  manual: 'Manual',
};

function hasFlag(flagName) {
  return process.argv.includes(flagName);
}

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index < 0 || index + 1 >= process.argv.length) {
    return '';
  }

  return process.argv[index + 1] ?? '';
}

function printHelp() {
  console.log(`Usage:
  node ./db/migrate-json-to-postgres.mjs --dry-run
  node ./db/migrate-json-to-postgres.mjs --write-sql
  node ./db/migrate-json-to-postgres.mjs --store-file ./data/store.json --out ./db/generated/preview.sql --write-sql

Options:
  --dry-run        Validate and print a table count summary only.
  --write-sql      Write an idempotent PostgreSQL insert script.
  --store-file     JSON store path. Defaults to backend/data/store.json.
  --out            SQL output path. Defaults to backend/db/generated/json-store-<timestamp>.sql.
  --skip-sessions  Do not migrate active login sessions.
  --help           Show this help.`);
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}

function normalizePath(inputPath, fallbackPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    return fallbackPath;
  }

  return resolve(process.cwd(), inputPath);
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`JSON store file not found: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function numberValue(value, fallbackValue = null) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return fallbackValue;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function integerValue(value, fallbackValue = null) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return fallbackValue;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallbackValue;
}

function booleanValue(value, fallbackValue = false) {
  return typeof value === 'boolean' ? value : fallbackValue;
}

function dateOnly(value) {
  const normalized = text(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return normalized.slice(0, 10);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function timestamp(value) {
  const normalized = text(value);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sqlString(value) {
  if (value === null || typeof value === 'undefined') {
    return 'null';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'null';
}

function sqlInteger(value) {
  return Number.isInteger(value) ? String(value) : 'null';
}

function sqlBoolean(value) {
  return value ? 'true' : 'false';
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? null))}::jsonb`;
}

function sqlDate(value) {
  return value ? `${sqlString(value)}::date` : 'null';
}

function sqlTimestamp(value) {
  return value ? `${sqlString(value)}::timestamptz` : 'null';
}

function nowSqlLiteral() {
  return sqlTimestamp(new Date().toISOString());
}

function makeIssueRecorder() {
  const issues = [];

  return {
    error(message) {
      issues.push({ level: 'error', message });
    },
    warn(message) {
      issues.push({ level: 'warning', message });
    },
    list() {
      return issues;
    },
    errors() {
      return issues.filter((issue) => issue.level === 'error');
    },
    warnings() {
      return issues.filter((issue) => issue.level === 'warning');
    },
  };
}

function requireTextField(issues, tableName, rowId, fieldName, value) {
  const normalized = text(value);

  if (!normalized) {
    issues.error(`${tableName}.${fieldName} is required for ${rowId || '(missing id)'}`);
    return null;
  }

  return normalized;
}

function assertUnique(issues, tableName, fieldName, value, seen) {
  if (!value) {
    return;
  }

  if (seen.has(value)) {
    issues.error(`${tableName}.${fieldName} has duplicate value: ${value}`);
    return;
  }

  seen.add(value);
}

function makeMetadataRows(store, sourceStoreFile) {
  const migratedAt = new Date().toISOString();
  const counts = {
    users: asArray(store.users).length,
    sessions: asArray(store.sessions).length,
    runs: asArray(store.runs).length,
    integrationImports: asArray(store.integrationImports).length,
    friendRequests: asArray(store.friendRequests).length,
    friendships: asArray(store.friendships).length,
    marketCatalog: asArray(store.marketCatalog).length,
    rewardRedemptions: asArray(store.rewardRedemptions).length,
    offlineRaceEvents: asArray(store.offlineRaceEvents).length,
    notices: asArray(store.notices).length,
  };

  return [
    {
      key: sqlString('json_store_snapshot'),
      value: sqlJson({
        sourceStoreFile,
        version: store.version ?? null,
        counts,
        migratedAt,
      }),
      updated_at: sqlTimestamp(migratedAt),
    },
  ];
}

function buildUserRows(store, issues) {
  const rows = [];
  const seenIds = new Set();
  const seenUsernames = new Set();
  const seenPublicTags = new Set();

  for (const user of asArray(store.users)) {
    const id = requireTextField(issues, 'users', user?.id, 'id', user?.id);
    const username = requireTextField(issues, 'users', id, 'username', user?.username);
    const passwordHash = requireTextField(issues, 'users', id, 'password_hash', user?.passwordHash ?? user?.password);
    const nickname = requireTextField(issues, 'users', id, 'nickname', user?.name ?? user?.nickname ?? user?.username);
    const publicTag = requireTextField(issues, 'users', id, 'public_tag', user?.publicTag);

    if (!id || !username || !passwordHash || !nickname || !publicTag) {
      continue;
    }

    assertUnique(issues, 'users', 'id', id, seenIds);
    assertUnique(issues, 'users', 'username', username, seenUsernames);
    assertUnique(issues, 'users', 'public_tag', publicTag, seenPublicTags);

    rows.push({
      id: sqlString(id),
      username: sqlString(username),
      password_hash: sqlString(passwordHash),
      password_updated_at: sqlTimestamp(timestamp(user.passwordUpdatedAt)),
      nickname: sqlString(nickname),
      real_name: sqlString(optionalText(user.realName)),
      phone: sqlString(optionalText(user.phone)),
      birth_date: sqlDate(dateOnly(user.birthDate)),
      public_tag: sqlString(publicTag),
      province_name: sqlString(optionalText(user.provinceName)),
      city_name: sqlString(optionalText(user.cityName)),
      district_name: sqlString(optionalText(user.districtName)),
      university_name: sqlString(optionalText(user.universityName)),
      address_detail: sqlString(optionalText(user.addressDetail)),
      reward_points: sqlNumber(numberValue(user.rewardPoints, 0)),
      streak_days: sqlInteger(integerValue(user.streakDays, 0)),
      connected_sources: sqlJson(asArray(user.connectedSources)),
      notification_settings: sqlJson(user.notificationSettings ?? {}),
      created_at: sqlTimestamp(timestamp(user.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(user.createdAt)),
      updated_at: sqlTimestamp(timestamp(user.updatedAt ?? user.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(user.updatedAt ?? user.createdAt)),
    });
  }

  return {
    rows,
    knownUserIds: seenIds,
    publicTagToUserId: new Map(asArray(store.users)
      .map((user) => [text(user?.publicTag), text(user?.id)])
      .filter(([publicTag, userId]) => publicTag && userId)),
  };
}

function buildSessionRows(store, issues, knownUserIds, { skipSessions }) {
  if (skipSessions) {
    return [];
  }

  const rows = [];
  const seenTokens = new Set();

  for (const session of asArray(store.sessions)) {
    const token = text(session?.token);
    const userId = text(session?.userId);
    const expiresAt = timestamp(session?.expiresAt);

    if (!token || !userId || !expiresAt) {
      issues.warn(`sessions row skipped because token, userId, or expiresAt is missing.`);
      continue;
    }

    if (!knownUserIds.has(userId)) {
      issues.warn(`sessions row skipped because user does not exist: ${userId}`);
      continue;
    }

    if (seenTokens.has(token)) {
      issues.warn(`sessions row skipped because token is duplicated: ${token.slice(0, 8)}...`);
      continue;
    }

    seenTokens.add(token);

    rows.push({
      token: sqlString(token),
      user_id: sqlString(userId),
      created_at: sqlTimestamp(timestamp(session.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(session.createdAt)),
      expires_at: sqlTimestamp(expiresAt),
    });
  }

  return rows;
}

function buildRunRows(store, issues, knownUserIds) {
  const rows = [];
  const seenIds = new Set();
  const seenExternalKeys = new Set();

  for (const run of asArray(store.runs)) {
    const id = requireTextField(issues, 'runs', run?.id, 'id', run?.id);
    const userId = requireTextField(issues, 'runs', id, 'user_id', run?.userId);
    const runDate = dateOnly(run?.date);
    const distanceKm = numberValue(run?.distanceKm);

    if (!id || !userId) {
      continue;
    }

    if (!knownUserIds.has(userId)) {
      issues.error(`runs.user_id references missing user: ${userId}`);
      continue;
    }

    if (!runDate) {
      issues.error(`runs.run_date is required for ${id}`);
      continue;
    }

    if (typeof distanceKm !== 'number' || distanceKm < 0) {
      issues.error(`runs.distance_km is invalid for ${id}`);
      continue;
    }

    if (seenIds.has(id)) {
      issues.error(`runs.id has duplicate value: ${id}`);
      continue;
    }

    seenIds.add(id);

    const sourceType = text(run.sourceType) || 'manual';
    const externalId = optionalText(run.externalId);
    const externalKey = externalId ? `${userId}::${sourceType}::${externalId}` : '';

    if (externalKey && seenExternalKeys.has(externalKey)) {
      issues.warn(`runs row skipped because external key is duplicated: ${externalKey}`);
      continue;
    }

    if (externalKey) {
      seenExternalKeys.add(externalKey);
    }

    rows.push({
      id: sqlString(id),
      user_id: sqlString(userId),
      run_date: sqlDate(runDate),
      distance_km: sqlNumber(distanceKm),
      pace: sqlString(optionalText(run.pace)),
      source_label: sqlString(text(run.source) || SOURCE_LABEL_BY_TYPE[sourceType] || sourceType),
      source_type: sqlString(sourceType),
      external_id: sqlString(externalId),
      route: run.route ? sqlJson(run.route) : 'null',
      duration_seconds: sqlInteger(integerValue(run.durationSeconds)),
      cadence_spm: sqlInteger(integerValue(run.cadenceSpm)),
      elevation_gain_m: sqlNumber(numberValue(run.elevationGainM)),
      started_at: sqlTimestamp(timestamp(run.startedAt)),
      ended_at: sqlTimestamp(timestamp(run.endedAt)),
      imported_at: sqlTimestamp(timestamp(run.importedAt)),
      created_at: sqlTimestamp(timestamp(run.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(run.createdAt)),
      updated_at: sqlTimestamp(timestamp(run.updatedAt ?? run.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(run.updatedAt ?? run.createdAt)),
    });
  }

  return rows;
}

function buildIntegrationImportRows(store, issues, knownUserIds) {
  const rows = [];
  const seenIds = new Set();
  const seenExternalKeys = new Set();

  for (const entry of asArray(store.integrationImports)) {
    const id = requireTextField(issues, 'integration_imports', entry?.id, 'id', entry?.id);
    const userId = requireTextField(issues, 'integration_imports', id, 'user_id', entry?.userId);
    const sourceType = text(entry?.sourceType);

    if (!id || !userId || !sourceType) {
      continue;
    }

    if (!knownUserIds.has(userId)) {
      issues.warn(`integration_imports row skipped because user does not exist: ${userId}`);
      continue;
    }

    if (seenIds.has(id)) {
      issues.warn(`integration_imports row skipped because id is duplicated: ${id}`);
      continue;
    }

    seenIds.add(id);

    const externalId = optionalText(entry.externalId);
    const externalKey = externalId ? `${userId}::${sourceType}::${externalId}` : '';

    if (externalKey && seenExternalKeys.has(externalKey)) {
      issues.warn(`integration_imports row skipped because external key is duplicated: ${externalKey}`);
      continue;
    }

    if (externalKey) {
      seenExternalKeys.add(externalKey);
    }

    rows.push({
      id: sqlString(id),
      user_id: sqlString(userId),
      source_type: sqlString(sourceType),
      source_label: sqlString(text(entry.sourceLabel) || SOURCE_LABEL_BY_TYPE[sourceType] || sourceType),
      external_id: sqlString(externalId),
      run_date: sqlDate(dateOnly(entry.date)),
      distance_km: sqlNumber(numberValue(entry.distanceKm)),
      pace: sqlString(optionalText(entry.pace)),
      import_status: sqlString(text(entry.importStatus) || 'pending'),
      raw_payload: sqlJson(entry.rawPayload ?? entry),
      received_at: sqlTimestamp(timestamp(entry.receivedAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(entry.receivedAt)),
      processed_at: sqlTimestamp(timestamp(entry.processedAt)),
    });
  }

  return rows;
}

function buildFriendRequestRows(store, issues, knownUserIds) {
  const rows = [];
  const seenIds = new Set();

  for (const request of asArray(store.friendRequests)) {
    const id = requireTextField(issues, 'friend_requests', request?.id, 'id', request?.id);
    const requesterId = text(request?.requesterId);
    const receiverId = text(request?.receiverId);

    if (!id || !requesterId || !receiverId) {
      issues.warn(`friend_requests row skipped because id/requester/receiver is missing.`);
      continue;
    }

    if (!knownUserIds.has(requesterId) || !knownUserIds.has(receiverId)) {
      issues.warn(`friend_requests row skipped because requester or receiver does not exist: ${id}`);
      continue;
    }

    if (requesterId === receiverId) {
      issues.warn(`friend_requests row skipped because requester equals receiver: ${id}`);
      continue;
    }

    if (seenIds.has(id)) {
      issues.warn(`friend_requests row skipped because id is duplicated: ${id}`);
      continue;
    }

    seenIds.add(id);

    rows.push({
      id: sqlString(id),
      requester_id: sqlString(requesterId),
      receiver_id: sqlString(receiverId),
      status: sqlString(text(request.status) || 'pending'),
      created_at: sqlTimestamp(timestamp(request.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(request.createdAt)),
      updated_at: sqlTimestamp(timestamp(request.updatedAt ?? request.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(request.updatedAt ?? request.createdAt)),
    });
  }

  return rows;
}

function buildFriendshipRows(store, issues, knownUserIds) {
  const rows = [];
  const seenIds = new Set();
  const seenPairs = new Set();

  asArray(store.friendships).forEach((friendship, index) => {
    const userIds = asArray(friendship?.userIds).map(text).filter(Boolean);
    const [leftUserId, rightUserId] = [...userIds].sort();
    const id = text(friendship?.id) || `friendship-migrated-${String(index + 1).padStart(5, '0')}`;

    if (!leftUserId || !rightUserId || leftUserId === rightUserId) {
      issues.warn(`friendships row skipped because user pair is invalid: ${id}`);
      return;
    }

    if (!knownUserIds.has(leftUserId) || !knownUserIds.has(rightUserId)) {
      issues.warn(`friendships row skipped because a user does not exist: ${id}`);
      return;
    }

    const pairKey = `${leftUserId}::${rightUserId}`;

    if (seenIds.has(id) || seenPairs.has(pairKey)) {
      issues.warn(`friendships row skipped because id or pair is duplicated: ${id}`);
      return;
    }

    seenIds.add(id);
    seenPairs.add(pairKey);

    rows.push({
      id: sqlString(id),
      user_a_id: sqlString(leftUserId),
      user_b_id: sqlString(rightUserId),
      created_at: sqlTimestamp(timestamp(friendship.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(friendship.createdAt)),
    });
  });

  return rows;
}

function buildMarketItemRows(store, issues) {
  const rows = [];
  const seenIds = new Set();

  for (const item of asArray(store.marketCatalog)) {
    const id = requireTextField(issues, 'market_items', item?.id, 'id', item?.id);
    const title = requireTextField(issues, 'market_items', id, 'title', item?.title);
    const category = requireTextField(issues, 'market_items', id, 'category', item?.category);

    if (!id || !title || !category) {
      continue;
    }

    if (seenIds.has(id)) {
      issues.error(`market_items.id has duplicate value: ${id}`);
      continue;
    }

    seenIds.add(id);

    rows.push({
      id: sqlString(id),
      title: sqlString(title),
      category: sqlString(category),
      description: sqlString(text(item.description)),
      cost_points: sqlInteger(integerValue(item.costPoints, 0)),
      partner_name: sqlString(optionalText(item.partnerName)),
      repeatable: sqlBoolean(booleanValue(item.repeatable, false)),
      inventory_count: sqlInteger(integerValue(item.inventoryCount)),
      is_active: sqlBoolean(item.isActive !== false),
      created_at: sqlTimestamp(timestamp(item.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(item.createdAt)),
      updated_at: sqlTimestamp(timestamp(item.updatedAt ?? item.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(item.updatedAt ?? item.createdAt)),
    });
  }

  return {
    rows,
    knownItemIds: seenIds,
  };
}

function buildRewardRedemptionRows(store, issues, knownUserIds, knownItemIds) {
  const rows = [];
  const seenIds = new Set();

  for (const redemption of asArray(store.rewardRedemptions)) {
    const id = requireTextField(issues, 'reward_redemptions', redemption?.id, 'id', redemption?.id);
    const userId = text(redemption?.userId);
    const itemId = text(redemption?.itemId);

    if (!id || !userId || !itemId) {
      issues.warn(`reward_redemptions row skipped because id/user/item is missing.`);
      continue;
    }

    if (!knownUserIds.has(userId)) {
      issues.warn(`reward_redemptions row skipped because user does not exist: ${id}`);
      continue;
    }

    if (!knownItemIds.has(itemId)) {
      issues.warn(`reward_redemptions row skipped because market item does not exist: ${id}`);
      continue;
    }

    if (seenIds.has(id)) {
      issues.warn(`reward_redemptions row skipped because id is duplicated: ${id}`);
      continue;
    }

    seenIds.add(id);

    rows.push({
      id: sqlString(id),
      user_id: sqlString(userId),
      item_id: sqlString(itemId),
      cost_points: sqlInteger(integerValue(redemption.costPoints, 0)),
      status: sqlString(text(redemption.status) || 'requested'),
      admin_note: sqlString(text(redemption.adminNote)),
      requested_at: sqlTimestamp(timestamp(redemption.requestedAt ?? redemption.claimedAt)) === 'null'
        ? 'now()'
        : sqlTimestamp(timestamp(redemption.requestedAt ?? redemption.claimedAt)),
      fulfilled_at: sqlTimestamp(timestamp(redemption.fulfilledAt)),
    });
  }

  return rows;
}

function buildOfflineRaceEventRows(store, issues) {
  const rows = [];
  const seenIds = new Set();

  for (const event of asArray(store.offlineRaceEvents)) {
    const id = requireTextField(issues, 'offline_race_events', event?.id, 'id', event?.id);
    const title = requireTextField(issues, 'offline_race_events', id, 'title', event?.title);
    const distanceKm = numberValue(event?.distanceKm);
    const startsAt = timestamp(event?.startsAt);
    const registrationClosesAt = timestamp(event?.registrationClosesAt);

    if (!id || !title) {
      continue;
    }

    if (typeof distanceKm !== 'number' || distanceKm <= 0) {
      issues.error(`offline_race_events.distance_km is invalid for ${id}`);
      continue;
    }

    if (!startsAt || !registrationClosesAt) {
      issues.error(`offline_race_events startsAt/registrationClosesAt is required for ${id}`);
      continue;
    }

    if (seenIds.has(id)) {
      issues.error(`offline_race_events.id has duplicate value: ${id}`);
      continue;
    }

    seenIds.add(id);

    rows.push({
      id: sqlString(id),
      title: sqlString(title),
      subtitle: sqlString(text(event.subtitle)),
      distance_km: sqlNumber(distanceKm),
      starts_at: sqlTimestamp(startsAt),
      registration_closes_at: sqlTimestamp(registrationClosesAt),
      participation_mode: sqlString(text(event.participationMode) || 'remote'),
      proof_method: sqlString(text(event.proofMethod) || 'app_record'),
      run_window_minutes: sqlInteger(integerValue(event.runWindowMinutes, 60)),
      host_label: sqlString(text(event.hostLabel) || 'RUNNIGAPP'),
      capacity: sqlInteger(integerValue(event.capacity)),
      entry_fee_points: sqlInteger(integerValue(event.entryFeePoints, 0)),
      distance_options: sqlJson(asArray(event.distanceOptions).length > 0
        ? event.distanceOptions
        : [{ distanceKm, entryFeePoints: integerValue(event.entryFeePoints, 0) }]),
      operation_note: sqlString(text(event.operationNote)),
      is_active: sqlBoolean(event.isActive !== false),
      created_at: sqlTimestamp(timestamp(event.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(event.createdAt)),
      updated_at: sqlTimestamp(timestamp(event.updatedAt ?? event.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(event.updatedAt ?? event.createdAt)),
    });
  }

  return {
    rows,
    knownEventIds: seenIds,
  };
}

function buildOfflineRaceEntryRows(store, issues, publicTagToUserId, knownEventIds) {
  const rows = [];
  const seenKeys = new Set();

  for (const event of asArray(store.offlineRaceEvents)) {
    const eventId = text(event?.id);

    if (!eventId || !knownEventIds.has(eventId)) {
      continue;
    }

    const distanceKm = numberValue(event.distanceKm, 0);
    const entryPoints = integerValue(event.entryFeePoints, 0);

    [...new Set(asArray(event.registeredUserTags).map(text).filter(Boolean))].forEach((publicTag, index) => {
      const userId = publicTagToUserId.get(publicTag);

      if (!userId) {
        issues.warn(`offline_race_entries row skipped because registered public tag has no user: ${publicTag}`);
        return;
      }

      const key = `${eventId}::${userId}`;

      if (seenKeys.has(key)) {
        issues.warn(`offline_race_entries row skipped because event/user is duplicated: ${key}`);
        return;
      }

      seenKeys.add(key);

      rows.push({
        id: sqlString(`${eventId}-entry-${String(index + 1).padStart(4, '0')}`),
        event_id: sqlString(eventId),
        user_id: sqlString(userId),
        public_tag: sqlString(publicTag),
        distance_km: sqlNumber(distanceKm),
        entry_points: sqlInteger(entryPoints),
        status: sqlString('registered'),
        registered_at: sqlTimestamp(timestamp(event.registeredAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(event.registeredAt)),
        cancelled_at: 'null',
      });
    });
  }

  return rows;
}

function buildOfflineRaceGuideRows(store) {
  return asArray(store.offlineRaceGuideSteps)
    .map(text)
    .filter(Boolean)
    .map((message, index) => ({
      position: sqlInteger(index + 1),
      message: sqlString(message),
      updated_at: nowSqlLiteral(),
    }));
}

function buildNoticeRows(store, issues) {
  const rows = [];
  const seenIds = new Set();

  for (const notice of asArray(store.notices)) {
    const id = requireTextField(issues, 'notices', notice?.id, 'id', notice?.id);
    const title = requireTextField(issues, 'notices', id, 'title', notice?.title);
    const message = requireTextField(issues, 'notices', id, 'message', notice?.message);

    if (!id || !title || !message) {
      continue;
    }

    if (seenIds.has(id)) {
      issues.error(`notices.id has duplicate value: ${id}`);
      continue;
    }

    seenIds.add(id);

    rows.push({
      id: sqlString(id),
      title: sqlString(title),
      message: sqlString(message),
      priority: sqlInteger(integerValue(notice.priority, 0)),
      is_active: sqlBoolean(notice.isActive !== false),
      created_at: sqlTimestamp(timestamp(notice.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(notice.createdAt)),
      updated_at: sqlTimestamp(timestamp(notice.updatedAt ?? notice.createdAt)) === 'null' ? 'now()' : sqlTimestamp(timestamp(notice.updatedAt ?? notice.createdAt)),
    });
  }

  return rows;
}

function buildMigrationPlan(store, sourceStoreFile, options = {}) {
  const issues = makeIssueRecorder();
  const metadataRows = makeMetadataRows(store, sourceStoreFile);
  const { rows: userRows, knownUserIds, publicTagToUserId } = buildUserRows(store, issues);
  const sessionRows = buildSessionRows(store, issues, knownUserIds, options);
  const runRows = buildRunRows(store, issues, knownUserIds);
  const integrationImportRows = buildIntegrationImportRows(store, issues, knownUserIds);
  const friendRequestRows = buildFriendRequestRows(store, issues, knownUserIds);
  const friendshipRows = buildFriendshipRows(store, issues, knownUserIds);
  const { rows: marketItemRows, knownItemIds } = buildMarketItemRows(store, issues);
  const rewardRedemptionRows = buildRewardRedemptionRows(store, issues, knownUserIds, knownItemIds);
  const { rows: offlineRaceEventRows, knownEventIds } = buildOfflineRaceEventRows(store, issues);
  const offlineRaceEntryRows = buildOfflineRaceEntryRows(store, issues, publicTagToUserId, knownEventIds);
  const offlineRaceGuideRows = buildOfflineRaceGuideRows(store);
  const noticeRows = buildNoticeRows(store, issues);

  const tables = [
    {
      name: 'app_metadata',
      columns: ['key', 'value', 'updated_at'],
      rows: metadataRows,
      conflictTarget: '(key)',
      updateColumns: ['value', 'updated_at'],
    },
    {
      name: 'users',
      columns: [
        'id', 'username', 'password_hash', 'password_updated_at', 'nickname', 'real_name', 'phone', 'birth_date',
        'public_tag', 'province_name', 'city_name', 'district_name', 'university_name', 'address_detail',
        'reward_points', 'streak_days', 'connected_sources', 'notification_settings', 'created_at', 'updated_at',
      ],
      rows: userRows,
      conflictTarget: '(id)',
      updateColumns: [
        'username', 'password_hash', 'password_updated_at', 'nickname', 'real_name', 'phone', 'birth_date',
        'public_tag', 'province_name', 'city_name', 'district_name', 'university_name', 'address_detail',
        'reward_points', 'streak_days', 'connected_sources', 'notification_settings', 'updated_at',
      ],
    },
    {
      name: 'sessions',
      columns: ['token', 'user_id', 'created_at', 'expires_at'],
      rows: sessionRows,
      conflictTarget: '(token)',
      updateColumns: ['user_id', 'expires_at'],
    },
    {
      name: 'runs',
      columns: [
        'id', 'user_id', 'run_date', 'distance_km', 'pace', 'source_label', 'source_type', 'external_id',
        'route', 'duration_seconds', 'cadence_spm', 'elevation_gain_m', 'started_at', 'ended_at',
        'imported_at', 'created_at', 'updated_at',
      ],
      rows: runRows,
      conflictTarget: '(id)',
      updateColumns: [
        'user_id', 'run_date', 'distance_km', 'pace', 'source_label', 'source_type', 'external_id',
        'route', 'duration_seconds', 'cadence_spm', 'elevation_gain_m', 'started_at', 'ended_at',
        'imported_at', 'updated_at',
      ],
    },
    {
      name: 'integration_imports',
      columns: [
        'id', 'user_id', 'source_type', 'source_label', 'external_id', 'run_date', 'distance_km', 'pace',
        'import_status', 'raw_payload', 'received_at', 'processed_at',
      ],
      rows: integrationImportRows,
      conflictTarget: '(id)',
      updateColumns: [
        'user_id', 'source_type', 'source_label', 'external_id', 'run_date', 'distance_km', 'pace',
        'import_status', 'raw_payload', 'processed_at',
      ],
    },
    {
      name: 'friend_requests',
      columns: ['id', 'requester_id', 'receiver_id', 'status', 'created_at', 'updated_at'],
      rows: friendRequestRows,
      conflictTarget: '(id)',
      updateColumns: ['requester_id', 'receiver_id', 'status', 'updated_at'],
    },
    {
      name: 'friendships',
      columns: ['id', 'user_a_id', 'user_b_id', 'created_at'],
      rows: friendshipRows,
      conflictTarget: '(id)',
      updateColumns: ['user_a_id', 'user_b_id'],
    },
    {
      name: 'market_items',
      columns: [
        'id', 'title', 'category', 'description', 'cost_points', 'partner_name', 'repeatable',
        'inventory_count', 'is_active', 'created_at', 'updated_at',
      ],
      rows: marketItemRows,
      conflictTarget: '(id)',
      updateColumns: [
        'title', 'category', 'description', 'cost_points', 'partner_name', 'repeatable',
        'inventory_count', 'is_active', 'updated_at',
      ],
    },
    {
      name: 'reward_redemptions',
      columns: ['id', 'user_id', 'item_id', 'cost_points', 'status', 'admin_note', 'requested_at', 'fulfilled_at'],
      rows: rewardRedemptionRows,
      conflictTarget: '(id)',
      updateColumns: ['user_id', 'item_id', 'cost_points', 'status', 'admin_note', 'fulfilled_at'],
    },
    {
      name: 'offline_race_events',
      columns: [
        'id', 'title', 'subtitle', 'distance_km', 'starts_at', 'registration_closes_at', 'participation_mode',
        'proof_method', 'run_window_minutes', 'host_label', 'capacity', 'entry_fee_points', 'distance_options',
        'operation_note', 'is_active', 'created_at', 'updated_at',
      ],
      rows: offlineRaceEventRows,
      conflictTarget: '(id)',
      updateColumns: [
        'title', 'subtitle', 'distance_km', 'starts_at', 'registration_closes_at', 'participation_mode',
        'proof_method', 'run_window_minutes', 'host_label', 'capacity', 'entry_fee_points', 'distance_options',
        'operation_note', 'is_active', 'updated_at',
      ],
    },
    {
      name: 'offline_race_entries',
      columns: ['id', 'event_id', 'user_id', 'public_tag', 'distance_km', 'entry_points', 'status', 'registered_at', 'cancelled_at'],
      rows: offlineRaceEntryRows,
      conflictTarget: '(id)',
      updateColumns: ['event_id', 'user_id', 'public_tag', 'distance_km', 'entry_points', 'status', 'cancelled_at'],
    },
    {
      name: 'offline_race_guide_steps',
      columns: ['position', 'message', 'updated_at'],
      rows: offlineRaceGuideRows,
      conflictTarget: '(position)',
      updateColumns: ['message', 'updated_at'],
    },
    {
      name: 'notices',
      columns: ['id', 'title', 'message', 'priority', 'is_active', 'created_at', 'updated_at'],
      rows: noticeRows,
      conflictTarget: '(id)',
      updateColumns: ['title', 'message', 'priority', 'is_active', 'updated_at'],
    },
  ];

  return {
    issues,
    tables,
  };
}

function buildInsertStatement(table) {
  if (table.rows.length === 0) {
    return `-- ${table.name}: no rows`;
  }

  const values = table.rows
    .map((row) => `  (${table.columns.map((column) => row[column] ?? 'null').join(', ')})`)
    .join(',\n');
  const updateClause = table.updateColumns.length > 0
    ? `do update set ${table.updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')}`
    : 'do nothing';

  return [
    `insert into ${table.name} (${table.columns.join(', ')})`,
    'values',
    values,
    `on conflict ${table.conflictTarget} ${updateClause};`,
  ].join('\n');
}

function buildSql(plan, sourceStoreFile) {
  const generatedAt = new Date().toISOString();
  const statements = plan.tables.map(buildInsertStatement).join('\n\n');

  return `-- Generated by backend/db/migrate-json-to-postgres.mjs
-- Generated at: ${generatedAt}
-- Source JSON store: ${sourceStoreFile}
-- Apply after backend/db/schema.sql has been applied.

begin;

${statements}

commit;
`;
}

function printSummary(plan, sourceStoreFile) {
  console.log(`[migration] source: ${sourceStoreFile}`);

  for (const table of plan.tables) {
    console.log(`[migration] ${table.name}: ${table.rows.length}`);
  }

  const warnings = plan.issues.warnings();
  const errors = plan.issues.errors();

  if (warnings.length > 0) {
    console.log('[migration] warnings:');
    warnings.forEach((issue) => {
      console.log(`- ${issue.message}`);
    });
  }

  if (errors.length > 0) {
    console.error('[migration] errors:');
    errors.forEach((issue) => {
      console.error(`- ${issue.message}`);
    });
  }
}

function main() {
  if (hasFlag('--help')) {
    printHelp();
    return;
  }

  const dryRun = hasFlag('--dry-run') || !hasFlag('--write-sql');
  const writeSql = hasFlag('--write-sql');
  const storeFile = normalizePath(readArgValue('--store-file'), defaultStoreFile);
  const outputPath = normalizePath(
    readArgValue('--out'),
    resolve(defaultOutputDirectory, `json-store-${timestampForFileName()}.sql`),
  );
  const store = readJsonFile(storeFile);
  const plan = buildMigrationPlan(store, storeFile, {
    skipSessions: hasFlag('--skip-sessions'),
  });

  printSummary(plan, storeFile);

  if (plan.issues.errors().length > 0) {
    process.exitCode = 1;
    return;
  }

  if (dryRun && !writeSql) {
    console.log('[migration] dry-run complete. No SQL file was written.');
    return;
  }

  const sql = buildSql(plan, storeFile);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, sql, 'utf8');
  console.log(`[migration] SQL written: ${outputPath}`);
  console.log(`[migration] apply with: psql "$DATABASE_URL" -f ${outputPath}`);
}

main();
