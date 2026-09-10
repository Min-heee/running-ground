import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveUpcomingMatchCancelPrompt } from './upcomingMatchCancelPrompt';

test('official reservations cancel without a prompt', () => {
  assert.equal(resolveUpcomingMatchCancelPrompt({ mode: 'duel' }), null);
  assert.equal(resolveUpcomingMatchCancelPrompt({ mode: 'group', roomId: '' }), null);
});

test('party-run reservations ask 파티런 예약을 취소할까요? before calling the cancel API (host)', () => {
  const duel = resolveUpcomingMatchCancelPrompt({ mode: 'duel', roomId: 'room-1', isRoomHost: true });
  assert.equal(duel?.title, '파티런 예약을 취소할까요?');
  assert.equal(duel?.message, '상대에게 취소 알림이 가고, 파티런 대기방도 함께 사라져요.');
  assert.equal(duel?.confirmLabel, '예약 취소');

  const group = resolveUpcomingMatchCancelPrompt({ mode: 'group', roomId: 'room-2', isRoomHost: true });
  assert.equal(group?.message, '참가자 전원에게 취소 알림이 가고, 파티런 대기방도 함께 사라져요.');
});

// 취소의 결과는 역할마다 다르다 — 방장은 예약 전체 취소, 게스트는 본인만 이탈 (2026-09-10).
test('the party cancel prompt speaks the caller\'s own outcome', () => {
  const host = resolveUpcomingMatchCancelPrompt({ roomId: 'room-1', mode: 'duel', isRoomHost: true });
  assert.equal(host?.title, '파티런 예약을 취소할까요?');
  assert.equal(host?.confirmLabel, '예약 취소');
  assert.match(host?.message ?? '', /대기방도 함께 사라져요/);

  const guest = resolveUpcomingMatchCancelPrompt({ roomId: 'room-1', mode: 'duel', isRoomHost: false });
  assert.equal(guest?.title, '파티런 예약에서 빠질까요?');
  assert.equal(guest?.confirmLabel, '예약에서 빠지기');
  assert.equal(guest?.message, '방장에게 알림이 가고, 대기방은 방장에게 그대로 남아요.');

  // isRoomHost가 없는 옛 서버 응답도 게스트 문구로 안전하게 떨어진다(거짓말하지 않는다).
  assert.equal(resolveUpcomingMatchCancelPrompt({ roomId: 'room-1', mode: 'group' })?.confirmLabel, '예약에서 빠지기');
  assert.equal(resolveUpcomingMatchCancelPrompt({ mode: 'duel' }), null, '공식 예약은 확인 없이 취소');
});
