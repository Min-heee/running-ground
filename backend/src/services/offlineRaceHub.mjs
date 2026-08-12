import { getRunsForUser } from '../lib/userStoreHelpers.mjs';

const DEFAULT_OFFLINE_RACE_GUIDE_STEPS = [
  '오프라인 마라톤 일정이 열리면 여기에서 날짜별로 바로 신청할 수 있어요.',
  '지금은 일정 등록 전이라 신청 가능한 회차가 없어요.',
  '실제 운영 일정이 준비되면 시간대와 거리 선택이 함께 열릴 예정이에요.',
];

export function ensureOfflineRaceStore(store) {
  if (!Array.isArray(store.offlineRaceEvents)) {
    store.offlineRaceEvents = [];
  }

  for (const event of store.offlineRaceEvents) {
    if (!Array.isArray(event.registeredUserTags)) {
      event.registeredUserTags = [];
    }
  }

  if (!Array.isArray(store.offlineRaceGuideSteps)) {
    store.offlineRaceGuideSteps = [...DEFAULT_OFFLINE_RACE_GUIDE_STEPS];
  }
}

export function getOfflineRaceStatus(event, now = new Date()) {
  const startsAt = new Date(event.startsAt).getTime();
  const registrationClosesAt = new Date(event.registrationClosesAt).getTime();
  const runWindowMinutes = typeof event.runWindowMinutes === 'number' && Number.isFinite(event.runWindowMinutes)
    ? event.runWindowMinutes
    : 180;
  const finishedAt = startsAt + runWindowMinutes * 60 * 1000;
  const currentTime = now.getTime();

  if (currentTime >= finishedAt) {
    return 'finished';
  }

  if (currentTime >= startsAt) {
    return 'live';
  }

  if (currentTime >= registrationClosesAt) {
    return 'registration_closed';
  }

  if (registrationClosesAt - currentTime <= 3 * 60 * 60 * 1000) {
    return 'registration_closing';
  }

  return 'registration_open';
}

export function buildOfflineRaceParticipantPreview(store, event, limit = 3) {
  const uniqueTags = [...new Set(event.registeredUserTags ?? [])];

  return uniqueTags
    .map((tag) => store.users.find((user) => user.publicTag === tag))
    .filter(Boolean)
    .slice(0, limit)
    .map((user) => {
      const latestRun = getRunsForUser(store, user.id)[0] ?? null;

      return {
        id: user.id,
        name: user.name,
        paceGoal: latestRun?.pace ?? '5:30/km',
        regionLabel: user.districtName,
      };
    });
}

export function decorateOfflineRaceEvent(store, event, currentUser = null) {
  const participantCount = [...new Set(event.registeredUserTags ?? [])].length;
  const currentUserTag = currentUser?.publicTag;

  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    distanceKm: event.distanceKm,
    startsAt: event.startsAt,
    registrationClosesAt: event.registrationClosesAt,
    participationMode: event.participationMode,
    proofMethod: event.proofMethod,
    runWindowMinutes: event.runWindowMinutes,
    hostLabel: event.hostLabel,
    participantCount,
    capacity: event.capacity,
    entryFeePoints: event.entryFeePoints,
    operationNote: event.operationNote,
    registered: typeof currentUserTag === 'string' ? (event.registeredUserTags ?? []).includes(currentUserTag) : false,
    // live_group 편성 세션 id — 레이스 탭의 아레나 자동 핸드오프가 출발 직전 러닝 탭으로
    // 넘어갈 때 focus 대상이 된다. 참가 검증은 매치 엔드포인트가 하므로 노출 자체는 안전.
    formedMatchId: typeof event.formedMatchId === 'string' ? event.formedMatchId : null,
    // 비밀번호 자체는 절대 내보내지 않는다 — 클라는 입력창을 띄울지만 판단한다.
    passwordRequired: Boolean(event.joinPassword),
    status: getOfflineRaceStatus(event),
    participantPreview: buildOfflineRaceParticipantPreview(store, event),
  };
}

export function buildOfflineRacePastEvent(store, event) {
  const participantPreview = buildOfflineRaceParticipantPreview(store, event, 1);
  const participantCount = [...new Set(event.registeredUserTags ?? [])].length;

  return {
    id: event.id,
    title: event.title,
    distanceKm: event.distanceKm,
    finishedAt: event.startsAt,
    modeLabel: event.participationMode,
    winnerName: participantPreview[0]?.name ?? '기록 집계 중',
    finishers: participantCount,
    summary: participantCount > 0
      ? `${participantCount}명이 참여한 ${event.distanceKm}km 회차였어요.`
      : '참가 기록이 아직 없어요.',
  };
}

export function buildAdminOfflineRaceEvent(store, event) {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    distanceKm: event.distanceKm,
    startsAt: event.startsAt,
    registrationClosesAt: event.registrationClosesAt,
    participationMode: event.participationMode,
    proofMethod: event.proofMethod,
    runWindowMinutes: event.runWindowMinutes,
    hostLabel: event.hostLabel,
    participantCount: [...new Set(event.registeredUserTags ?? [])].length,
    capacity: event.capacity,
    entryFeePoints: event.entryFeePoints,
    operationNote: event.operationNote,
    status: getOfflineRaceStatus(event),
  };
}

export function buildAdminOfflineRaceEvents(store) {
  ensureOfflineRaceStore(store);
  return {
    events: [...store.offlineRaceEvents]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      .map((event) => buildAdminOfflineRaceEvent(store, event)),
  };
}

export function buildOfflineRaceHub(store, user) {
  ensureOfflineRaceStore(store);
  const sortedEvents = [...store.offlineRaceEvents]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const upcomingEvents = sortedEvents
    .filter((event) => getOfflineRaceStatus(event) !== 'finished')
    .map((event) => decorateOfflineRaceEvent(store, event, user));
  const featuredEvent = upcomingEvents.find((event) => event.registered) ?? upcomingEvents[0] ?? null;

  return {
    featuredEvent,
    upcomingEvents: upcomingEvents.filter((event) => event.id !== featuredEvent?.id),
    pastEvents: sortedEvents
      .filter((event) => getOfflineRaceStatus(event) === 'finished')
      .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())
      .slice(0, 8)
      .map((event) => buildOfflineRacePastEvent(store, event)),
    guideSteps: [...(store.offlineRaceGuideSteps ?? DEFAULT_OFFLINE_RACE_GUIDE_STEPS)],
  };
}
