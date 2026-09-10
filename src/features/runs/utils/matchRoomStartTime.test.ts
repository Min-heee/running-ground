import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWeeklyHourlySlots,
  formatMatchDateKey,
  resolveMatchTimeSection,
} from './matchScheduling';
import {
  buildRoomScheduleDateOptions,
  buildVisibleRoomSlots,
  filterOpenRoomSlots,
  findRoomSlot,
  resolveRoomSavedSlotState,
  resolveRoomScheduleSelection,
} from './matchRoomStartTime';

// 09:15 기준 → 09:00은 마감, 10:00부터 열림 (30분 전 마감 규칙, 서버 validateMatchSlotInput과 동일).
const NOW = new Date('2026-09-09T09:15:00.000Z');
const allSlots = buildWeeklyHourlySlots(NOW);
const openSlots = filterOpenRoomSlots(allSlots, NOW);
const firstOpen = '2026-09-09T10:00:00.000Z';

test('open room slots drop every closed hour and start at the first hour ≥ now+30min', () => {
  assert.equal(openSlots.every((slot) => !slot.isClosed), true);
  assert.equal(openSlots[0]?.startsAt, firstOpen);
  assert.equal(openSlots.some((slot) => slot.startsAt === '2026-09-09T09:00:00.000Z'), false);
  // 7일 창을 넘지 않는다.
  assert.equal(Date.parse(openSlots.at(-1)!.startsAt) <= NOW.getTime() + 7 * 24 * 3600 * 1000, true);
});

test('date options are de-duplicated per day and only list days with an open slot', () => {
  const dateOptions = buildRoomScheduleDateOptions(openSlots);
  const keys = dateOptions.map((option) => option.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], formatMatchDateKey(new Date(firstOpen)));
  assert.equal(keys.every((key) => openSlots.some((slot) => slot.dateKey === key)), true);
});

test('findRoomSlot matches by instant, not by string formatting', () => {
  assert.equal(findRoomSlot(openSlots, '2026-09-10T02:00:00Z')?.startsAt, '2026-09-10T02:00:00.000Z');
  assert.equal(findRoomSlot(openSlots, 'not-a-date'), null);
  assert.equal(findRoomSlot(openSlots, undefined), null);
});

// 정시 칩 목록은 고른 날짜 + 오전/오후 조합의 열린 슬롯만 담는다 (칩 탭은 초안, 저장은 정시 탭에서).
test('visible slots are exactly that day and half of the day', () => {
  const todayKey = formatMatchDateKey(new Date(firstOpen));
  const firstOpenSection = resolveMatchTimeSection(firstOpen);
  const visible = buildVisibleRoomSlots(openSlots, todayKey, firstOpenSection);
  assert.equal(visible.length > 0, true);
  assert.equal(visible.every((slot) => slot.dateKey === todayKey && resolveMatchTimeSection(slot.startsAt) === firstOpenSection), true);
  assert.equal(visible[0]?.startsAt, firstOpen);
  assert.deepEqual(buildVisibleRoomSlots(openSlots, '1999-01-01', 'am'), []);
});

test('selection derives from the saved room slot and flags a saved slot that has since closed', () => {
  const scheduled = resolveRoomScheduleSelection({
    openSlots,
    startMode: 'scheduled',
    slotStartAt: '2026-09-10T02:00:00.000Z',
    now: NOW,
  });
  assert.equal(scheduled.selectedSlotStartAt, '2026-09-10T02:00:00.000Z');
  assert.equal(scheduled.selectedDateKey, formatMatchDateKey(new Date('2026-09-10T02:00:00.000Z')));
  assert.equal(scheduled.selectedSection, resolveMatchTimeSection('2026-09-10T02:00:00.000Z'));
  assert.equal(scheduled.isSavedSlotClosed, false);

  const closed = resolveRoomScheduleSelection({
    openSlots,
    startMode: 'scheduled',
    slotStartAt: '2026-09-09T09:00:00.000Z',
    now: NOW,
  });
  assert.equal(closed.selectedSlotStartAt, null);
  assert.equal(closed.isSavedSlotClosed, true);
  assert.equal(closed.selectedDateKey, formatMatchDateKey(new Date('2026-09-09T09:00:00.000Z')));

  const host = resolveRoomScheduleSelection({
    openSlots,
    startMode: 'host',
    slotStartAt: NOW.toISOString(),
    now: NOW,
  });
  assert.equal(host.selectedSlotStartAt, null);
  assert.equal(host.isSavedSlotClosed, false);
  assert.equal(host.selectedDateKey, formatMatchDateKey(new Date(firstOpen)));
});

test('open slots are re-judged against the clock, not the cached isClosed flag', () => {
  // 캐시가 09:00에 만들어졌다면 10:00은 열려 있었지만, 09:31에는 닫혀야 한다.
  const cachedAtNineSharp = buildWeeklyHourlySlots(new Date('2026-09-09T09:00:00.000Z'));
  assert.equal(cachedAtNineSharp.find((slot) => slot.startsAt === firstOpen)?.isClosed, false);
  const openAtNineThirtyOne = filterOpenRoomSlots(cachedAtNineSharp, new Date('2026-09-09T09:31:00.000Z'));
  assert.equal(openAtNineThirtyOne.some((slot) => slot.startsAt === firstOpen), false);
  assert.equal(openAtNineThirtyOne[0]?.startsAt, '2026-09-09T11:00:00.000Z');
});

test('saved slot state: open / cutoff (inside 30 minutes, still reservable) / passed', () => {
  assert.equal(resolveRoomSavedSlotState('2026-09-09T11:00:00.000Z', NOW), 'open');
  assert.equal(resolveRoomSavedSlotState('2026-09-09T09:40:00.000Z', NOW), 'cutoff');
  assert.equal(resolveRoomSavedSlotState('2026-09-09T09:00:00.000Z', NOW), 'passed');
  assert.equal(resolveRoomSavedSlotState('garbage', NOW), 'passed');

  const cutoff = resolveRoomScheduleSelection({ openSlots, startMode: 'scheduled', slotStartAt: '2026-09-09T09:40:00.000Z', now: NOW });
  assert.equal(cutoff.savedSlotState, 'cutoff');
  assert.equal(cutoff.isSavedSlotClosed, true);
  assert.equal(cutoff.selectedSlotStartAt, '2026-09-09T09:40:00.000Z', '마감 창 안의 저장 슬롯은 여전히 선택된 시간이다');
  const passed = resolveRoomScheduleSelection({ openSlots, startMode: 'scheduled', slotStartAt: '2026-09-09T09:00:00.000Z', now: NOW });
  assert.equal(passed.savedSlotState, 'passed');
  assert.equal(passed.selectedSlotStartAt, null);
});
