import {
  buildParticipantAveragePaceLabel,
} from '@/features/runs/viewModels/matchProgress';
import {
  buildProgressiveRaceBoardRows,
  buildRaceBoardSubtitle,
  sortProgressiveRaceRows,
} from '@/features/runs/viewModels/liveMatchRaceBoardProgressive';
import type { LiveMatchRaceBoardViewModel, LiveMatchRaceBoardViewModelInput } from './liveMatchRaceBoardViewModel';

type GroupRaceBoardSectionInput = Pick<
  LiveMatchRaceBoardViewModelInput,
  | 'currentUserArenaPace'
  | 'currentUserGroupLiveStatus'
  | 'currentUserName'
  | 'distanceKm'
  | 'groupArenaUsesLivePace'
  | 'groupDistanceKm'
  | 'groupLiveStandings'
  | 'roomLinkedGroupPlaceholderParticipants'
  | 'visibleMatchRoom'
>;

export function buildGroupRaceBoardSection({
  currentUserArenaPace,
  currentUserGroupLiveStatus,
  currentUserName,
  distanceKm,
  groupArenaUsesLivePace,
  groupDistanceKm,
  groupLiveStandings,
  roomLinkedGroupPlaceholderParticipants,
  visibleMatchRoom,
}: GroupRaceBoardSectionInput): LiveMatchRaceBoardViewModel {
  if (groupLiveStandings.length > 0) {
    // 모든 행은 서버가 준 같은 기준의 숫자를 쓴다. 순위(participant.rank)도 그 기준에서
    // 나오므로, 내 행만 로컬 거리로 바닥을 깔면 한 카드 안에서 순위와 숫자가 어긋난다
    // ("1위 상대 5.35km" 위에 "2위 나 5.61km"). 실제로 그렇게 고쳐 봤다가 되돌렸다 —
    // 근거는 liveMatchProgressModel의 같은 자리 주석에 있다.
    const progressiveRows = buildProgressiveRaceBoardRows(groupLiveStandings.map((participant) => ({
      id: participant.id,
      rank: participant.rank,
      // 컴포넌트 마스크 제거 후 폴백은 VM 책임 — 내 행도 실제 닉네임, '나'는 이름 부재 폴백.
      name: participant.name.trim() || (participant.isCurrentUser ? '나' : '러너'),
      paceLabel: participant.isCurrentUser
        ? currentUserArenaPace
        : buildParticipantAveragePaceLabel(participant, groupArenaUsesLivePace),
      distanceKm: participant.currentDistanceKm,
      remainingKm: Math.max(0, groupDistanceKm - participant.currentDistanceKm),
      progress: groupDistanceKm > 0 ? participant.currentDistanceKm / groupDistanceKm : 0,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
      forfeitedAt: participant.forfeitedAt,
      // Same fix the duel board already has: rivals who are still RUNNING must stay
      // visible on the live rank page instead of collapsing to "완주한 러너만 보여요".
    })), { hideRunningOthers: false });

    return {
      title: '그룹 레이스 보드',
      subtitle: buildRaceBoardSubtitle({
        fallback: '전체 순위 흐름과 각 러너의 남은 거리를 계속 확인할 수 있어요.',
        progressiveRows,
      }),
      rows: progressiveRows.rows,
    };
  }

  if (roomLinkedGroupPlaceholderParticipants.length > 0) {
    const placeholderDistanceKm = visibleMatchRoom?.linkedMatchDistanceKm ?? visibleMatchRoom?.distanceKm ?? groupDistanceKm;
    const progressiveRows = sortProgressiveRaceRows(roomLinkedGroupPlaceholderParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      distanceKm: participant.distanceKm,
      remainingKm: Math.max(0, placeholderDistanceKm - participant.distanceKm),
      progress: placeholderDistanceKm > 0 ? participant.distanceKm / placeholderDistanceKm : 0,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus,
    })), { hideRunningOthers: false });

    return {
      title: '그룹 레이스 보드',
      subtitle: buildRaceBoardSubtitle({
        fallback: '그룹 대결 정보를 맞추는 중에도 참가자 목록과 내 진행 거리를 볼 수 있어요.',
        progressiveRows,
      }),
      rows: progressiveRows.rows,
    };
  }

  return {
    title: '그룹 레이스 보드',
    subtitle: '그룹 기록을 맞추는 중이에요. 내 기록은 계속 측정되고 있어요.',
    rows: [
      {
        id: 'current-user-fallback',
        rank: 1,
        name: currentUserName?.trim() || '나',
        distanceKm,
        remainingKm: Math.max(0, groupDistanceKm - distanceKm),
        progress: groupDistanceKm > 0 ? distanceKm / groupDistanceKm : 0,
        isCurrentUser: true,
        liveStatus: currentUserGroupLiveStatus ?? undefined,
      },
    ],
  };
}
