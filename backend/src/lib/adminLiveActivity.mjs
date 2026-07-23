// 관리자 라이브 현황 (GET /api/admin/live) — "지금 누가 달리고 있나" 스냅샷.
// PURE: store (+now) in, normalized payload out.
//
//  - sessions: 진행 중 대결 세션 (1대1/그룹/파티런) + 참가자별 라이브 거리/페이스
//  - rooms:    아직 시작 전인 파티 대기방 (linkedMatchId가 생기면 세션 쪽으로 넘어감)
//  - liveRuns: 라이브 공유가 켜진 솔로 러너 (친구 탭 '달리는 중' 표시와 같은 소스)

// 이 시간 안에 갱신이 없으면 stale로 표시 (liveRunShares의 기존 기준과 동일).
const LIVE_SHARE_STALE_MS = 2 * 60 * 1000;

function findUser(store, userId) {
  return (store.users ?? []).find((entry) => entry.id === userId) ?? null;
}

function userLabel(store, userId) {
  const user = findUser(store, userId);
  return {
    name: user?.name ?? '(탈퇴한 러너)',
    tag: user?.publicTag ?? '',
  };
}

export function buildAdminLiveActivity(store, now = new Date()) {
  const nowMs = now.getTime();

  const sessions = (store.matchSessions ?? []).map((session) => ({
    id: session.id,
    mode: session.mode,
    isPartyRun: session.isPartyRun === true,
    isTestMatch: session.isTestMatch === true,
    distanceKm: session.distanceKm ?? null,
    slotStartAt: session.slotStartAt ?? null,
    createdAt: session.createdAt ?? null,
    participants: (session.participants ?? []).map((participant) => ({
      ...userLabel(store, participant.userId),
      liveStatus: participant.liveStatus ?? 'ready',
      liveDistanceKm: participant.liveDistanceKm ?? 0,
      livePace: participant.livePace ?? '--:--/km',
      liveElapsedSeconds: participant.liveElapsedSeconds ?? 0,
      finished: Boolean(participant.finishedAt),
      finishElapsedSeconds: participant.finishElapsedSeconds ?? null,
      liveUpdatedAt: participant.liveUpdatedAt ?? null,
    })),
  }));

  const rooms = (store.matchRooms ?? [])
    .filter((room) => !room.linkedMatchId)
    .map((room) => ({
      id: room.id,
      mode: room.mode,
      startMode: room.startMode ?? 'scheduled',
      distanceKm: room.distanceKm ?? null,
      slotStartAt: room.slotStartAt ?? null,
      createdAt: room.createdAt ?? null,
      inviteToken: room.inviteToken ?? '',
      hostName: userLabel(store, room.hostUserId).name,
      participantCount: (room.participants ?? []).length,
      maxParticipants: room.maxParticipants ?? null,
    }));

  const liveRuns = (store.liveRunShares ?? [])
    .filter((share) => share.enabled === true && (share.status === 'running' || share.status === 'paused'))
    .map((share) => {
      const updatedAtMs = Date.parse(share.updatedAt ?? '');
      return {
        ...userLabel(store, share.userId),
        status: share.status,
        locationLabel: share.locationLabel ?? '',
        updatedAt: share.updatedAt ?? null,
        stale: !Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > LIVE_SHARE_STALE_MS,
      };
    });

  return {
    generatedAt: now.toISOString(),
    counts: {
      sessions: sessions.length,
      rooms: rooms.length,
      liveRuns: liveRuns.filter((run) => !run.stale).length,
    },
    sessions,
    rooms,
    liveRuns,
  };
}
