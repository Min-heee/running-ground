import { memo, useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import type { TimeSlotSelectorProps } from '@/features/runs/components/matchSetupCards/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';

export const TIME_SECTIONS = [{ key: 'am' as const, label: '오전' }, { key: 'pm' as const, label: '오후' }];
export type TimeSectionKey = (typeof TIME_SECTIONS)[number]['key'];

// 값 타일 (오너 2026-07-31, 매칭 하단 '가'안): 탭 이름만 보여주던 TabPill을 대체한다.
// 라벨(날짜/시간/거리) 아래에 '지금 고른 값'이 항상 떠 있어, 어느 탭에 있든 예약 내용
// 전체가 한눈에 보인다 — 탭을 옮겨야 값이 보이던 것이 이전 구조의 문제였다.
export const ValueTile = memo(function ValueTile({ active, label, value, onPress }: {
  active: boolean;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.valueTile, active ? styles.valueTileActive : undefined]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} ${value}`}
    >
      <Text style={[styles.valueTileLabel, active ? styles.valueTileLabelActive : undefined]}>
        {label}
      </Text>
      <Text
        style={[styles.valueTileValue, active ? styles.valueTileValueActive : undefined]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </Pressable>
  );
});

export const MatchDistanceChip = memo(function MatchDistanceChip({
  distanceKm,
  onDistanceTextChange,
  onShowCustomDistanceInputChange,
  selected,
}: {
  distanceKm: number;
  onDistanceTextChange: (value: string) => void;
  onShowCustomDistanceInputChange: (value: boolean) => void;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onDistanceTextChange(String(distanceKm));
    onShowCustomDistanceInputChange(false);
  }, [distanceKm, onDistanceTextChange, onShowCustomDistanceInputChange]);

  return (
    <Pressable
      style={[styles.matchDistanceChip, selected ? styles.matchDistanceChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.matchDistanceChipText, selected ? styles.matchDistanceChipTextSelected : undefined]}>
        {distanceKm}km
      </Text>
    </Pressable>
  );
});

export const MatchDateChip = memo(function MatchDateChip({
  dateOption,
  onSelectDate,
  selected,
}: {
  dateOption: TimeSlotSelectorProps['dateOptions'][number];
  onSelectDate: (dateKey: string) => void;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelectDate(dateOption.key);
  }, [dateOption.key, onSelectDate]);

  return (
    <Pressable
      style={[styles.slotDateChip, selected ? styles.slotDateChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.slotDateChipLabel, selected ? styles.slotDateChipLabelSelected : undefined]}>
        {dateOption.label}
      </Text>
      <Text style={[styles.slotDateChipMeta, selected ? styles.slotDateChipMetaSelected : undefined]}>
        {dateOption.subtitle}
      </Text>
    </Pressable>
  );
});

export const TimeSectionChip = memo(function TimeSectionChip({
  onSelectTimeSection,
  section,
  selected,
}: {
  onSelectTimeSection: (sectionKey: TimeSectionKey) => void;
  section: { key: TimeSectionKey; label: string };
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelectTimeSection(section.key);
  }, [onSelectTimeSection, section.key]);

  return (
    <Pressable
      style={[styles.slotSectionChip, selected ? styles.slotSectionChipSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.slotSectionChipText, selected ? styles.slotSectionChipTextSelected : undefined]}>
        {section.label}
      </Text>
    </Pressable>
  );
});

export const MatchSlotChip = memo(function MatchSlotChip({
  count,
  onSelectSlot,
  selected,
  slot,
}: {
  count: number;
  onSelectSlot: (slotStartAt: string) => void;
  selected: boolean;
  slot: TimeSlotSelectorProps['slotOptions'][number];
}) {
  const handlePress = useCallback(() => {
    if (!slot.isClosed) {
      onSelectSlot(slot.startsAt);
    }
  }, [onSelectSlot, slot.isClosed, slot.startsAt]);

  return (
    <Pressable
      disabled={slot.isClosed}
      style={[
        styles.duelSlotChip,
        selected ? styles.duelSlotChipSelected : undefined,
        slot.isClosed ? styles.duelSlotChipDisabled : undefined,
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.duelSlotLabel, selected ? styles.duelSlotLabelSelected : undefined]}>
        {slot.label}
      </Text>
      {count > 0 ? <Text style={styles.duelSlotWaitingCount}>{count}명 대기</Text> : null}
      {slot.isClosed ? <Text style={styles.duelSlotClosedText}>마감</Text> : null}
    </Pressable>
  );
});
