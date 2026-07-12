export function ensurePhoneVerificationChallenges(store) {
  if (!Array.isArray(store.phoneVerificationChallenges)) {
    store.phoneVerificationChallenges = [];
  }

  return store.phoneVerificationChallenges;
}

export function cleanupPhoneVerificationChallenges(store, now = new Date()) {
  const challenges = ensurePhoneVerificationChallenges(store);
  const nowMs = now.getTime();
  const beforeCount = challenges.length;

  store.phoneVerificationChallenges = challenges.filter((challenge) => {
    const expiresAtMs = Date.parse(challenge.expiresAt ?? '');
    const registrationExpiresAtMs = Date.parse(challenge.registrationExpiresAt ?? '');
    const updatedAtMs = Date.parse(challenge.updatedAt ?? challenge.createdAt ?? '');

    if (challenge.status === 'verified') {
      return Number.isFinite(registrationExpiresAtMs) && registrationExpiresAtMs > nowMs;
    }

    if (challenge.status === 'consumed') {
      return Number.isFinite(updatedAtMs) && updatedAtMs + 10 * 60 * 1000 > nowMs;
    }

    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });

  return beforeCount !== store.phoneVerificationChallenges.length;
}
