import type {
  GroupMatchParticipant,
  RunningMatchStatusResponse,
} from '@/lib/api/types';
import type { LiveCardBoardRunner } from './buildLiveCardState';

// 카드 보드 빌더 — react-native를 모르는 순수 모듈(노드 테스트 가능). 컨트롤러가 재수출한다.

// Identify "me" + extract a single current distance per group participant. Prefer the official
// frozen distance once ready, else the live distance. `mySeedRank` (the response's mySeedRank)
// marks which participant is the current user.
function buildGroupBoard(
  participants: GroupMatchParticipant[],
  mySeedRank: number | undefined,
): LiveCardBoardRunner[] {
  const meSeedRank = mySeedRank ?? 1;
  return participants.map((participant) => ({
    name: participant.name,
    distanceKm: participant.officialReady && typeof participant.officialDistanceKm === 'number'
      ? participant.officialDistanceKm
      : participant.liveDistanceKm ?? 0,
    isMe: participant.seedRank === meSeedRank,
  }));
}

// Build the match board (duel or group) from a status response + my own current distance/name.
// Returns [] when there is no usable opponent/participant data yet (the card then renders the
// solo-shaped time/distance/pace, which buildLiveCardState handles for an empty board).
export function buildBoardFromMatchStatus(
  status: RunningMatchStatusResponse,
  myDistanceKm: number,
  myName: string,
): LiveCardBoardRunner[] {
  if (status.mode === 'group') {
    const participants = status.participants ?? [];
    if (participants.length === 0) {
      return [];
    }
    return buildGroupBoard(participants, status.mySeedRank);
  }

  // duel
  const opponent = status.opponent;
  if (!opponent) {
    return [];
  }
  const opponentDistanceKm = opponent.officialReady && typeof opponent.officialDistanceKm === 'number'
    ? opponent.officialDistanceKm
    : opponent.liveDistanceKm ?? 0;
  // 기준 혼합 금지 (2026-08-25 실전: 잠금카드 간격 50-60m vs 인앱 10m). 예전엔 내 행만
  // 생값(myDistanceKm)이라 상대 행(공정비교 기준)과 시간 기준이 섞였고, 그 기준 시차만큼
  // 내 리드가 부풀려졌다 — 두 폰이 동시에 서로 "+50m"를 볼 수도 있는 구조. 인앱 듀얼
  // 보드와 똑같이 내 행도 officialComparison.userDistanceKm(같은 공통 시점의 내 값)을
  // 쓴다. 공정비교가 아직 없으면(시작 직후 ~10초) 예전 생값 폴백 — 그 창에서는 상대도
  // 생값이라 기준이 비슷하다. 카드 상단의 내 거리/페이스 숫자는 이 보드와 무관하게 계속
  // 생값이다(인앱의 기록 vs 보드 짝과 동일한 구도).
  const myOfficialDistanceKm = status.officialComparison?.userDistanceKm;
  const myBoardDistanceKm = opponent.officialReady && typeof myOfficialDistanceKm === 'number'
    ? myOfficialDistanceKm
    : myDistanceKm;
  return [
    { name: myName, distanceKm: myBoardDistanceKm, isMe: true },
    { name: opponent.name, distanceKm: opponentDistanceKm, isMe: false },
  ];
}
