// 파티런 방 종류 선택 (1대1 대결 / 그룹 대결).
//
// 파티런 패널에서 떼어낸 이유 (오너 2026-07-31): 러닝 탭의 회색 박스 안에는 '고르는 것'만
// 남기고 나머지(초대 코드 입력, 방 만들기 같은 설정·실행 UI)는 박스 밖으로 내보낸다.
// 다른 탭에서 모드 카드가 박스 안에 있는 것과 같은 자리다 — 파티런 탭에서는 이 칩이
// 그 역할을 한다.

import { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RunningMatchRoomMode } from '@/lib/api/types';
import { matchPickerCardStyles } from '@/features/runs/components/matchPickerCardStyles';
import { beginRgInputTrace } from '@/utils/rgInputTrace';

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
        style={[
          matchPickerCardStyles.card,
          optionIsSelected ? matchPickerCardStyles.cardSelected : matchPickerCardStyles.cardIdle,
        ]}
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
        <Text style={matchPickerCardStyles.cardTitle}>{option.label}</Text>
      </Pressable>
    );
  }), [onRoomModeChange, roomMode]);

  return <View style={matchPickerCardStyles.row}>{chips}</View>;
});
