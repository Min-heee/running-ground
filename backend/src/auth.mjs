import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_HASH_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
};

function isHexString(value) {
  return typeof value === 'string' && /^[0-9a-f]+$/i.test(value);
}

function buildPasswordHash(saltBuffer, derivedKeyBuffer) {
  return `${PASSWORD_HASH_PREFIX}$${saltBuffer.toString('hex')}$${derivedKeyBuffer.toString('hex')}`;
}

export function hashPassword(password) {
  const saltBuffer = randomBytes(PASSWORD_SALT_BYTES);
  const derivedKeyBuffer = scryptSync(password, saltBuffer, PASSWORD_KEY_BYTES, PASSWORD_HASH_OPTIONS);
  return buildPasswordHash(saltBuffer, derivedKeyBuffer);
}

export function isPasswordHash(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const parts = value.split('$');

  if (parts.length !== 3) {
    return false;
  }

  const [prefix, saltHex, hashHex] = parts;
  return prefix === PASSWORD_HASH_PREFIX && isHexString(saltHex) && isHexString(hashHex);
}

export function verifyPassword(password, storedPassword) {
  if (typeof storedPassword !== 'string' || !storedPassword) {
    return false;
  }

  if (!isPasswordHash(storedPassword)) {
    return storedPassword === password;
  }

  const [, saltHex, hashHex] = storedPassword.split('$');
  const storedHashBuffer = Buffer.from(hashHex, 'hex');
  const derivedKeyBuffer = scryptSync(password, Buffer.from(saltHex, 'hex'), storedHashBuffer.length, PASSWORD_HASH_OPTIONS);

  return storedHashBuffer.length === derivedKeyBuffer.length && timingSafeEqual(storedHashBuffer, derivedKeyBuffer);
}

export function setUserPassword(user, password, updatedAt = new Date().toISOString()) {
  user.passwordHash = hashPassword(password);
  user.passwordUpdatedAt = updatedAt;
  delete user.password;
  return user;
}

export function buildSessionExpiry(sessionTtlMs, now = new Date()) {
  return new Date(now.getTime() + sessionTtlMs).toISOString();
}

export function isSessionExpired(session, now = new Date()) {
  if (typeof session?.expiresAt !== 'string') {
    return false;
  }

  const expiresAtTimestamp = Date.parse(session.expiresAt);

  return Number.isFinite(expiresAtTimestamp) && expiresAtTimestamp <= now.getTime();
}

export function migrateAuthStore(store, { sessionTtlMs, now = new Date() }) {
  let changed = false;
  const nowIso = now.toISOString();

  if (Array.isArray(store.users)) {
    for (const user of store.users) {
      if (typeof user.passwordHash === 'string' && user.passwordHash) {
        if (typeof user.password === 'string') {
          delete user.password;
          changed = true;
        }

        if (typeof user.passwordUpdatedAt !== 'string') {
          user.passwordUpdatedAt = nowIso;
          changed = true;
        }

        continue;
      }

      if (typeof user.password === 'string' && user.password) {
        setUserPassword(user, user.password, nowIso);
        changed = true;
      }
    }
  }

  if (!Array.isArray(store.sessions)) {
    store.sessions = [];
    return true;
  }

  const nextSessions = [];

  for (const session of store.sessions) {
    if (!session || typeof session.token !== 'string' || typeof session.userId !== 'string') {
      changed = true;
      continue;
    }

    if (typeof session.createdAt !== 'string') {
      session.createdAt = nowIso;
      changed = true;
    }

    if (typeof session.expiresAt !== 'string') {
      session.expiresAt = buildSessionExpiry(sessionTtlMs, now);
      changed = true;
    }

    if (isSessionExpired(session, now)) {
      changed = true;
      continue;
    }

    nextSessions.push(session);
  }

  if (nextSessions.length !== store.sessions.length) {
    store.sessions = nextSessions;
    changed = true;
  }

  return changed;
}
