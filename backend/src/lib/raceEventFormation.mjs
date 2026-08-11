// 8·15런 편성 (docs/815-run-plan-2026-08-11.md): eventKind 'live_group'인 레이스 이벤트는
// 신청 마감이 지나면 신청자 전원을 **하나의 그룹 매치 세션**으로 묶는다 (오너 확정: 조 나누기
// 없음). slotStartAt = 이벤트 startsAt — 이후는 기존 깔때기가 전부 담당한다: 상태 폴이 세션
// 참가자를 스캔해 홈 예정 대결 카드에 띄우고, 아레나 자동 오픈 → 카운트다운 워밍업 → 정각
// 카운트다운 → 라이브 순위판 → 그룹 판정.
//
// 트리거는 이 백엔드의 관례대로 on-request 스윕이다 (별도 스케줄러 없음): 레이스 허브 GET이
// 부른다. 신청자들은 출발 전에 레이스 탭을 보고 있으므로 사실상 즉시 발화한다.
//
// createMatchSession을 그대로 재사용하는 것이 핵심이다 — 세션 모양(참가자·체크포인트 배열)이
// 매칭 경로와 바이트 단위로 같아지고, 진행 중인 로스터 내구화 작업이 착지하면 그 choke point의
// 로스터 기록도 자동으로 탄다.

import { createMatchSession } from './runningMatchSession/matchSessionLifecycle.mjs';

// 마감~출발 사이가 정상 편성 창. 출발 후에도 이 유예까지는 편성한다 — 첫 허브 요청이 늦게
// 도착해도(전원이 출발 직전에야 앱을 여는 경우) 행사가 통째로 무산되지 않게. 세션은 슬롯이
// 지난 상태로 만들어져도 즉시 active로 승격되므로 지각 출발이 될 뿐이다.
export const RACE_FORMATION_GRACE_AFTER_START_MS = 10 * 60 * 1000;

// 그룹 최소 인원. 매칭 경로의 3과 달리 이벤트는 2명이어도 성립시킨다 (엔진은 test-mode에서
// 2인 그룹 세션을 이미 지원하고, 축제를 인원 미달로 취소하는 것보다 2인 대결이 낫다).
export const RACE_FORMATION_MIN_PARTICIPANTS = 2;

function toMs(value) {
  const ms = Date.parse(value ?? '');
  return Number.isFinite(ms) ? ms : null;
}

// 신청 태그(publicTag 배열)를 실제 유저로 해석한다. 탈퇴/개명으로 못 찾는 태그는 조용히
// 건너뛴다 — 남은 사람들의 행사를 막을 이유가 없다.
function resolveRegistrants(store, event) {
  const tags = [...new Set(event.registeredUserTags ?? [])];
  const users = [];

  for (const tag of tags) {
    const user = (store.users ?? []).find((entry) => entry.publicTag === tag);
    if (user) {
      users.push(user);
    }
  }

  return users;
}

// 편성 스윕. 대상: eventKind 'live_group' + 미편성 + [마감, 출발+유예] 창 안 + 신청 2명 이상.
// 멱등: 편성되면 event.formedMatchId가 박혀 다시는 대상이 되지 않는다 (mutateStore의 무변경
// 직렬화 스킵과 함께, 허브 폴마다 불러도 비용이 없다).
export function formDueLiveGroupRaceSessions(store, now = new Date()) {
  const formed = [];

  for (const event of store.offlineRaceEvents ?? []) {
    if (event.eventKind !== 'live_group' || event.formedMatchId) {
      continue;
    }

    const closeMs = toMs(event.registrationClosesAt);
    const startMs = toMs(event.startsAt);

    if (closeMs === null || startMs === null) {
      continue;
    }

    const nowMs = now.getTime();

    if (nowMs < closeMs || nowMs > startMs + RACE_FORMATION_GRACE_AFTER_START_MS) {
      continue;
    }

    const registrants = resolveRegistrants(store, event);

    if (registrants.length < RACE_FORMATION_MIN_PARTICIPANTS) {
      continue;
    }

    const session = createMatchSession(store, 'group', event.distanceKm, event.startsAt, registrants, {
      isTestMatch: false,
      isPartyRun: false,
    });
    // createMatchSession은 매칭 큐 관례대로 거리를 소수 1자리로 정규화한다(8.15→8.2).
    // 이벤트 세션은 이벤트가 공표한 거리 그대로가 목표다 — 정확값으로 되돌린다. 하류(목표 판정·
    // 표시·체크포인트)는 전부 숫자 그대로 쓰므로 안전하다.
    session.distanceKm = event.distanceKm;
    event.formedMatchId = session.id;
    formed.push({ eventId: event.id, matchId: session.id, participantCount: registrants.length });
  }

  return formed;
}
