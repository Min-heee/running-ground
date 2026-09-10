import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { RunningMatchRoomStartMode } from '@/lib/api/types';
import {
  MatchDateChip,
  MatchSlotChip,
  TIME_SECTIONS,
  TimeSectionChip,
} from '@/features/runs/components/matchSetupCards/matchSetupSelectorChips';
import { matchSetupCardStyles } from '@/features/runs/components/matchSetupCards/styles';
import {
  getWeeklyHourlySlotsForNow,
  isMatchSlotClosed,
  type MatchTimeSection,
} from '@/features/runs/utils/matchScheduling';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';
import {
  buildRoomScheduleDateOptions,
  buildVisibleRoomSlots,
  filterOpenRoomSlots,
  resolveRoomScheduleSelection,
} from '@/features/runs/utils/matchRoomStartTime';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// 파티런 대기실 '시작 시간' 카드 (오너 2026-09-09). 방장만 본다, 세션이 묶이면(예약 확정) 사라진다.
//   [방장 시작] [예약 시작]                 ← 시작 방식 칩 2개
//   (예약 시작일 때)
//   [9.9 화] [9.10 수] [9.11 목] …          ← 날짜 칩 (열린 슬롯이 있는 날만, 최대 7일 창)
//   [오전] [오후]                            ← 시간대 칩
//   [10:00] [11:00] [12:00] …                ← 정시 칩 (30분 전 마감 이후는 안 보임)
//   "6.24 (수) 11:00에 시작해요."
// 저장은 정시 칩을 눌렀을 때만 한다 — '예약 시작'·날짜·오전/오후 칩은 화면 안의 초안이다. 예전엔
// '예약 시작'을 누르는 순간 가장 이른 정시가 저장돼, 초대 카드에서 그 시간을 본 친구가 바로
// 수락하면 방장이 고르지도 않은 시간이 확정됐다(적대 검증 2026-09-10). 초안은 방의 저장값
// (startMode/slotStartAt)이 바뀌는 순간 버려진다. 슬롯 목록은 공식 매칭 화면과 같은
// getWeeklyHourlySlotsForNow(정시·7일·30분 전 마감)에서 오되, 열림 여부는 지금 시각으로 다시 본다.

const NO_OPEN_SLOT_MESSAGE = '지금 고를 수 있는 시간이 없어요. 잠시 뒤 다시 시도해 주세요.';
const SLOT_JUST_CLOSED_MESSAGE = '그 시간은 방금 마감됐어요. 다른 시간을 골라 주세요.';

export type MatchRoomStartTimeSaveInput = {
  startMode: RunningMatchRoomStartMode;
  slotStartAt?: string;
};

type MatchRoomStartTimeCardProps = {
  startMode: RunningMatchRoomStartMode;
  slotStartAt: string;
  saving: boolean;
  onSaveStartMode: (input: MatchRoomStartTimeSaveInput) => void;
};

const START_MODE_OPTIONS: { key: RunningMatchRoomStartMode; label: string }[] = [
  { key: 'host', label: '방장 시작' },
  { key: 'scheduled', label: '예약 시작' },
];

// 저장되기 전의 화면 초안. forStartMode/forSlotStartAt은 초안이 만들어졌을 때의 방 저장값 —
// 저장값이 바뀌면(내 저장이 반영됐거나 다른 경로로 바뀌었거나) 초안은 무효다.
type StartTimeDraft = {
  forStartMode: RunningMatchRoomStartMode;
  forSlotStartAt: string;
  scheduled: boolean;
  dateKey: string | null;
  section: MatchTimeSection | null;
};

export function MatchRoomStartTimeCard({
  startMode,
  slotStartAt,
  saving,
  onSaveStartMode,
}: MatchRoomStartTimeCardProps) {
  const slotOptions = getWeeklyHourlySlotsForNow();
  // 방 폴링(수 초 간격)마다 리렌더되므로 '지금'은 충분히 신선하다. 탭 순간에는 한 번 더 확인한다.
  const nowMinuteKey = Math.floor(Date.now() / 60_000);
  const openSlots = useMemo(
    () => filterOpenRoomSlots(slotOptions, new Date(nowMinuteKey * 60_000)),
    [slotOptions, nowMinuteKey],
  );
  const dateOptions = useMemo(() => buildRoomScheduleDateOptions(openSlots), [openSlots]);
  const selection = useMemo(
    () => resolveRoomScheduleSelection({ openSlots, startMode, slotStartAt, now: new Date(nowMinuteKey * 60_000) }),
    [openSlots, slotStartAt, startMode, nowMinuteKey],
  );

  const [draft, setDraft] = useState<StartTimeDraft | null>(null);
  const activeDraft = draft && draft.forStartMode === startMode && draft.forSlotStartAt === slotStartAt ? draft : null;
  const showScheduled = startMode === 'scheduled' || Boolean(activeDraft?.scheduled);
  const selectedDateKey = activeDraft?.dateKey ?? selection.selectedDateKey;
  const selectedSection = activeDraft?.section ?? selection.selectedSection;
  const visibleSlots = useMemo(
    () => buildVisibleRoomSlots(openSlots, selectedDateKey, selectedSection),
    [openSlots, selectedDateKey, selectedSection],
  );
  const [notice, setNotice] = useState<string | null>(null);

  const updateDraft = useCallback((patch: Partial<Pick<StartTimeDraft, 'dateKey' | 'section'>>) => {
    setDraft((current) => {
      const base = current && current.forStartMode === startMode && current.forSlotStartAt === slotStartAt
        ? current
        : { forStartMode: startMode, forSlotStartAt: slotStartAt, scheduled: true, dateKey: null, section: null };
      return { ...base, scheduled: true, ...patch };
    });
  }, [slotStartAt, startMode]);

  const handleSelectStartMode = useCallback((nextMode: RunningMatchRoomStartMode) => {
    if (saving) {
      return;
    }

    setNotice(null);

    if (nextMode === 'host') {
      setDraft(null);
      if (startMode !== 'host') {
        onSaveStartMode({ startMode: 'host' });
      }
      return;
    }

    if (openSlots.length === 0) {
      setNotice(NO_OPEN_SLOT_MESSAGE);
      return;
    }

    // 저장하지 않는다 — 날짜·시간대·정시 칩이 펼쳐지고, 정시를 고르는 순간 저장된다.
    updateDraft({});
  }, [onSaveStartMode, openSlots.length, saving, startMode, updateDraft]);

  const handleSelectDate = useCallback((dateKey: string) => {
    if (saving) {
      return;
    }

    setNotice(null);
    updateDraft({ dateKey });
  }, [saving, updateDraft]);

  const handleSelectTimeSection = useCallback((section: MatchTimeSection) => {
    if (saving) {
      return;
    }

    setNotice(null);
    updateDraft({ section });
  }, [saving, updateDraft]);

  const handleSelectSlot = useCallback((nextSlotStartAt: string) => {
    if (saving || (startMode === 'scheduled' && nextSlotStartAt === selection.selectedSlotStartAt)) {
      return;
    }

    // 탭 순간 재확인 — 캐시된 목록이 열려 있다고 해도 마감이 방금 지났을 수 있다.
    if (isMatchSlotClosed(nextSlotStartAt, new Date())) {
      setNotice(SLOT_JUST_CLOSED_MESSAGE);
      return;
    }

    setNotice(null);
    setDraft(null);
    onSaveStartMode({ startMode: 'scheduled', slotStartAt: nextSlotStartAt });
  }, [onSaveStartMode, saving, selection.selectedSlotStartAt, startMode]);

  const startModeChips = useMemo(() => START_MODE_OPTIONS.map((option) => (
    <StartModeChip
      key={`room-start-mode-${option.key}`}
      option={option}
      selected={showScheduled ? option.key === 'scheduled' : option.key === 'host'}
      saving={saving}
      onSelect={handleSelectStartMode}
    />
  )), [handleSelectStartMode, saving, showScheduled]);

  const dateChips = useMemo(() => dateOptions.map((dateOption) => (
    <MatchDateChip
      key={`room-date-${dateOption.key}`}
      dateOption={dateOption}
      onSelectDate={handleSelectDate}
      selected={dateOption.key === selectedDateKey}
    />
  )), [dateOptions, handleSelectDate, selectedDateKey]);

  const sectionChips = useMemo(() => TIME_SECTIONS.map((section) => (
    <TimeSectionChip
      key={`room-section-${section.key}`}
      onSelectTimeSection={handleSelectTimeSection}
      section={section}
      selected={selectedSection === section.key}
    />
  )), [handleSelectTimeSection, selectedSection]);

  const slotChips = useMemo(() => visibleSlots.map((slot) => (
    <MatchSlotChip
      key={`room-slot-${slot.startsAt}`}
      count={0}
      onSelectSlot={handleSelectSlot}
      selected={slot.startsAt === selection.selectedSlotStartAt}
      slot={slot}
    />
  )), [handleSelectSlot, selection.selectedSlotStartAt, visibleSlots]);

  const helperText = (() => {
    if (startMode !== 'scheduled') {
      return showScheduled
        ? '날짜와 시간을 고르면 예약 시작으로 바뀌어요.'
        : '방장이 시작 버튼을 누르면 바로 카운트다운이 시작돼요.';
    }

    if (selection.savedSlotState === 'passed') {
      return '예약한 시간이 지났어요. 다른 시간을 골라 주세요.';
    }

    if (selection.savedSlotState === 'cutoff') {
      return `${formatRoomDateLabel(slotStartAt)}에 시작해요. 이 시간은 마감돼 다시 고를 수 없지만, 친구가 수락하면 그대로 예약돼요. 더 뒤 시간으로는 바꿀 수 있어요.`;
    }

    return `${formatRoomDateLabel(slotStartAt)}에 시작해요.`;
  })();

  return (
    <Card>
      <Text style={styles.sectionTitle}>시작 시간</Text>
      <View style={styles.modeRow}>
        {startModeChips}
      </View>

      {showScheduled ? (
        <View style={[styles.scheduleBox, saving ? styles.scheduleBoxSaving : undefined]} pointerEvents={saving ? 'none' : 'auto'}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={matchSetupCardStyles.slotDateScrollContent}
            style={matchSetupCardStyles.slotDateScroll}
          >
            {dateChips}
          </ScrollView>
          <View style={matchSetupCardStyles.slotSectionRow}>
            {sectionChips}
          </View>
          {visibleSlots.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={matchSetupCardStyles.duelSlotScrollContent}
              style={matchSetupCardStyles.duelSlotScroll}
            >
              {slotChips}
            </ScrollView>
          ) : (
            <Text style={styles.emptySlotText}>이 시간대엔 고를 수 있는 시간이 없어요.</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.helperText}>{notice ?? helperText}</Text>
    </Card>
  );
}

const StartModeChip = memo(function StartModeChip({
  onSelect,
  option,
  saving,
  selected,
}: {
  onSelect: (mode: RunningMatchRoomStartMode) => void;
  option: (typeof START_MODE_OPTIONS)[number];
  saving: boolean;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelect(option.key);
  }, [onSelect, option.key]);

  return (
    <Pressable
      style={[matchSetupCardStyles.slotSectionChip, selected ? matchSetupCardStyles.slotSectionChipSelected : undefined]}
      onPress={handlePress}
      disabled={saving}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: saving }}
    >
      <Text style={[matchSetupCardStyles.slotSectionChipText, selected ? matchSetupCardStyles.slotSectionChipTextSelected : undefined]}>
        {option.label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  scheduleBox: {
    gap: spacing.s10,
    marginTop: spacing.sm,
  },
  scheduleBoxSaving: {
    opacity: 0.6,
  },
  emptySlotText: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    paddingVertical: spacing.s10,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
});
