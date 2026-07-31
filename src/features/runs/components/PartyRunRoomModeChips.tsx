// 파티런 방 종류 선택 (1대1 대결 / 그룹 대결).
//
// 파티런 패널에서 떼어낸 이유 (오너 2026-07-31): 러닝 탭의 회색 박스 안에는 '고르는 것'만
// 남기고 나머지(초대 코드 입력, 방 만들기 같은 설정·실행 UI)는 박스 밖으로 내보낸다.
// 다른 탭에서 모드 카드가 박스 안에 있는 것과 같은 자리다 — 파티런 탭에서는 이 칩이
// 그 역할을 한다.

import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunningMatchRoomMode } from '@/lib/api/types';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const ROOM_MODE_OPTIONS = [
  { key: 'duel' as const, label: '1대1 대결' },
  { key: 'group' as const, label: '그룹 대결' },
];

type PartyRunRoomModeChipsProps = {
  roomMode: RunningMatchRoomMode;
  onRoomModeChange: (mode: RunningMatchRoomMode) => void;
};

export const PartyRunRoomModeChips = memo(function PartyRunRoomModeChips({
  roomMode,
  onRoomModeChange,
}: PartyRunRoomModeChipsProps) {
  const chips = useMemo(() => ROOM_MODE_OPTIONS.map((option) => {
    const optionIsSelected = roomMode === option.key;

    return (
      <Pressable
        key={option.key}
        style={[styles.chip, optionIsSelected ? styles.chipSelected : undefined]}
        onPress={() => {
          const trace = beginRgInputTrace('run mode select', {
            mode: option.key,
            source: 'party run room mode',
          });
          onRoomModeChange(option.key);
          trace.markFeedback('mode state dispatch');
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: optionIsSelected }}
      >
        <Text style={[styles.chipText, optionIsSelected ? styles.chipTextSelected : undefined]}>
          {option.label}
        </Text>
      </Pressable>
    );
  }), [onRoomModeChange, roomMode]);

  return <View style={styles.row}>{chips}</View>;
});

// 치수·색은 MatchOptionSelector의 모드 카드와 같은 값으로 맞춘다 — 매칭 탭의
// '1대1 매치 / 그룹 대결' 카드와 파티런 탭의 이 칩은 같은 층(고르는 것)이라 크기가 다르면
// 탭을 옮길 때마다 카드가 커졌다 작아졌다 한다.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  chip: {
    width: '48%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: fixedColors.textPrimary,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    minHeight: 84,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoInk,
  },
  chipText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  chipTextSelected: {
    color: colors.white,
  },
});
