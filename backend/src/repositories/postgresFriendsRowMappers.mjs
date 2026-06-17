import {
  asArray,
  asNumber,
  asObject,
  clone,
  hasValue,
  normalizeOptionalString,
  toDateOnly,
  toIsoString,
} from './postgresFriendsHelpers.mjs';

export function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.nickname,
    realName: row.real_name ?? '',
    phone: row.phone ?? '',
    birthDate: toDateOnly(row.birth_date),
    publicTag: row.public_tag,
    provinceName: row.province_name ?? '',
    cityName: row.city_name ?? '',
    districtName: row.district_name ?? '',
    addressDetail: row.address_detail ?? '',
    rewardPoints: asNumber(row.reward_points),
    streakDays: asNumber(row.streak_days),
    connectedSources: asArray(row.connected_sources),
    notificationSettings: asObject(row.notification_settings),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function mapRunRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateOnly(row.run_date),
    distanceKm: asNumber(row.distance_km),
    pace: row.pace ?? '',
    source: row.source_label ?? 'Manual',
    sourceType: row.source_type ?? 'manual',
    ...(row.external_id ? { externalId: row.external_id } : {}),
    ...(Array.isArray(row.route) ? { route: clone(row.route) } : {}),
    ...(row.match_result ? { matchResult: clone(row.match_result) } : {}),
    ...(hasValue(row.duration_seconds) ? { durationSeconds: asNumber(row.duration_seconds) } : {}),
    ...(hasValue(row.cadence_spm) ? { cadenceSpm: asNumber(row.cadence_spm) } : {}),
    ...(hasValue(row.elevation_gain_m) ? { elevationGainM: asNumber(row.elevation_gain_m) } : {}),
    ...(normalizeOptionalString(row.started_at) ? { startedAt: toIsoString(row.started_at) } : {}),
    ...(normalizeOptionalString(row.ended_at) ? { endedAt: toIsoString(row.ended_at) } : {}),
    ...(normalizeOptionalString(row.imported_at) ? { importedAt: toIsoString(row.imported_at) } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export function mapFriendRequestRow(row) {
  return {
    id: row.id,
    requesterId: row.requester_id,
    receiverId: row.receiver_id,
    status: row.status ?? 'pending',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
