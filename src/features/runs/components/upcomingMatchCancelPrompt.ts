import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { isPartyRunUpcomingMatch } from './upcomingMatchInteraction';

export type UpcomingMatchCancelPrompt = {
  title: string;
  message: string;
  confirmLabel: string;
};

// 다가오는 매치 카드의 '예약 취소' 확인 문구 (계약 C6). 공식 예약은 지금처럼 바로 취소,
// 파티런 예약은 한 번 묻는다 — 결과가 역할마다 다르기 때문이다(2026-09-10): 방장이 취소하면
// 예약과 대기방이 통째로 사라지고, 게스트가 취소하면 자기만 빠지고 방은 방장에게 남는다.
// 순수 함수 — Alert는 호출자가 띄운다.
export function resolveUpcomingMatchCancelPrompt(
  match: Pick<UpcomingRunningMatchItem, 'roomId' | 'mode'> & Partial<Pick<UpcomingRunningMatchItem, 'isRoomHost'>>,
): UpcomingMatchCancelPrompt | null {
  if (!isPartyRunUpcomingMatch(match)) {
    return null;
  }

  if (match.isRoomHost) {
    return {
      title: '파티런 예약을 취소할까요?',
      message: match.mode === 'duel'
        ? '상대에게 취소 알림이 가고, 파티런 대기방도 함께 사라져요.'
        : '참가자 전원에게 취소 알림이 가고, 파티런 대기방도 함께 사라져요.',
      confirmLabel: '예약 취소',
    };
  }

  return {
    title: '파티런 예약에서 빠질까요?',
    message: '방장에게 알림이 가고, 대기방은 방장에게 그대로 남아요.',
    confirmLabel: '예약에서 빠지기',
  };
}
