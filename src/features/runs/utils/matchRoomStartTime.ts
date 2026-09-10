import {
  buildMatchDateOptions,
  formatMatchDateKey,
  isMatchSlotClosed,
  resolveMatchTimeSection,
  type MatchDateOption,
  type MatchSlotOption,
  type MatchTimeSection,
} from '@/features/runs/utils/matchScheduling';

// 파티런 대기실 '시작 시간' 카드의 슬롯 선택 (오너 2026-09-09). 공식 매칭 화면과 같은
// 정시 슬롯(buildWeeklyHourlySlots: 정시·7일 창·30분 전 마감)을 그대로 쓰되, 대기실에는
// 마감된 시간을 보여줄 이유가 없어 열린 슬롯만 남긴다 — 서버 validateMatchSlotInput과
// 같은 규칙이라 여기서 고른 슬롯은 그대로 저장 가능하다.

// 슬롯 목록은 시간 단위로 캐시되고 isClosed는 만들 때 굳는다(getWeeklyHourlySlotsForNow) —
// 마감(30분 전)은 매 시 :30에 지나가므로 열림 여부는 지금 시각으로 다시 판정한다. 안 그러면
// 카드가 이미 닫힌 정시를 열린 것처럼 보여주고 저장이 400으로 튕긴다(적대 검증 2026-09-10).
export function filterOpenRoomSlots(slotOptions: MatchSlotOption[], now: Date = new Date()) {
  return slotOptions.filter((slot) => !isMatchSlotClosed(slot.startsAt, now));
}

export function buildRoomScheduleDateOptions(openSlots: MatchSlotOption[]): MatchDateOption[] {
  return buildMatchDateOptions(openSlots);
}

export function findRoomSlot(openSlots: MatchSlotOption[], slotStartAt: string | null | undefined) {
  if (!slotStartAt) {
    return null;
  }

  const slotStartMs = Date.parse(slotStartAt);
  if (!Number.isFinite(slotStartMs)) {
    return null;
  }

  return openSlots.find((slot) => Date.parse(slot.startsAt) === slotStartMs) ?? null;
}

// 날짜·시간대 칩이 고른 조합의 정시 목록. 칩 탭 자체는 저장하지 않고(카드의 초안), 여기서 나온
// 정시를 눌러야 저장된다 — 그래서 '그 날의 대표 슬롯을 골라주는' 헬퍼는 더 이상 없다.
export function buildVisibleRoomSlots(
  openSlots: MatchSlotOption[],
  dateKey: string,
  section: MatchTimeSection,
) {
  return openSlots.filter((slot) => (
    slot.dateKey === dateKey && resolveMatchTimeSection(slot.startsAt) === section
  ));
}

// 저장된 예약 시간의 상태: 'open' 아직 바꿀 수 있음 / 'cutoff' 출발 30분 안이라 다른 시간으로
// 바꿀 수는 없지만 친구가 수락하면 그대로 예약됨 / 'passed' 이미 지나 새 시간을 골라야 함.
export type RoomSavedSlotState = 'open' | 'cutoff' | 'passed';

export type RoomScheduleSelection = {
  selectedSlotStartAt: string | null;
  selectedDateKey: string;
  selectedSection: MatchTimeSection;
  // 방에 저장된 예약 시간이 이미 마감(30분 전)됐다 — 칩엔 아무것도 선택돼 있지 않고
  // 방장은 새 시간을 골라야 한다. (savedSlotState !== 'open'과 같다.)
  isSavedSlotClosed: boolean;
  savedSlotState: RoomSavedSlotState;
};

export function resolveRoomSavedSlotState(slotStartAt: string, now: Date = new Date()): RoomSavedSlotState {
  const slotMs = Date.parse(slotStartAt);
  if (!Number.isFinite(slotMs) || slotMs <= now.getTime()) {
    return 'passed';
  }

  return isMatchSlotClosed(slotStartAt, now) ? 'cutoff' : 'open';
}

// 카드가 그릴 선택 상태. 방의 startMode/slotStartAt에서만 파생한다 — 칩 탭은 곧 저장이라
// 별도 초안 상태를 두지 않는다(오전/오후는 카드가 잠깐 덮어쓸 수 있다).
export function resolveRoomScheduleSelection({
  openSlots,
  startMode,
  slotStartAt,
  now = new Date(),
}: {
  openSlots: MatchSlotOption[];
  startMode: 'host' | 'scheduled';
  slotStartAt: string;
  now?: Date;
}): RoomScheduleSelection {
  if (startMode !== 'scheduled') {
    const firstSlot = openSlots[0] ?? null;
    return {
      selectedSlotStartAt: null,
      selectedDateKey: firstSlot?.dateKey ?? formatMatchDateKey(now),
      selectedSection: firstSlot ? resolveMatchTimeSection(firstSlot.startsAt) : 'am',
      isSavedSlotClosed: false,
      savedSlotState: 'open',
    };
  }

  const savedSlot = findRoomSlot(openSlots, slotStartAt);
  const savedDate = new Date(slotStartAt);
  const hasParseableSaved = Number.isFinite(savedDate.getTime());
  const savedSlotState = resolveRoomSavedSlotState(slotStartAt, now);

  // 이미 지난 슬롯에 날짜 칩을 물려 두면 그 날엔 열린 시간이 없어 카드가 텅 빈 채로 멈춘다 —
  // 방장이 새 시간을 골라야 하는 상태이므로 첫 열린 슬롯으로 되돌린다 (적대 검증 2026-09-10).
  const anchorSlot = savedSlotState === 'passed' ? openSlots[0] ?? null : null;

  return {
    // 마감 창(cutoff) 안의 저장 슬롯은 칩 목록에 없어도 '선택된 시간'이다 — 친구가 수락하면 그대로
    // 예약되므로 방장에게 지났다고 말하면 안 된다.
    selectedSlotStartAt: savedSlot?.startsAt ?? (savedSlotState === 'cutoff' ? savedDate.toISOString() : null),
    selectedDateKey: savedSlot?.dateKey
      ?? anchorSlot?.dateKey
      ?? (hasParseableSaved ? formatMatchDateKey(savedDate) : openSlots[0]?.dateKey ?? formatMatchDateKey(now)),
    selectedSection: anchorSlot
      ? resolveMatchTimeSection(anchorSlot.startsAt)
      : hasParseableSaved
        ? resolveMatchTimeSection(slotStartAt)
        : (openSlots[0] ? resolveMatchTimeSection(openSlots[0].startsAt) : 'am'),
    isSavedSlotClosed: savedSlotState !== 'open',
    savedSlotState,
  };
}
