import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { RunningMatchRoomStartMode } from '@/lib/api/types';
import { MatchRoomWheelColumn } from '@/features/runs/components/matchRoom/MatchRoomWheelColumn';
import type { MatchRoomMeridiem } from '@/features/runs/types/matchRoom';
import {
  MATCH_ROOM_HOUR_OPTIONS,
  MATCH_ROOM_MINUTE_OPTIONS,
  buildScheduledStartAt,
  formatRoomDateLabel,
} from '@/features/runs/utils/matchRoomScheduling';

const START_MODE_OPTIONS = [
  { key: 'host' as const, label: '방장 시작' },
  { key: 'scheduled' as const, label: '예약 시작' },
];
const MERIDIEM_OPTIONS: MatchRoomMeridiem[] = ['오전', '오후'];

function formatMinuteWheelLabel(value: number | string) {
  return `${value}`.padStart(2, '0');
}

type MatchRoomStartModeCardProps = {
  startMode: RunningMatchRoomStartMode;
  saving: boolean;
  meridiem: MatchRoomMeridiem;
  hourIndex: number;
  minuteIndex: number;
  scheduledStartAt: string;
  onMeridiemChange: (value: MatchRoomMeridiem) => void;
  onHourIndexChange: (value: number) => void;
  onMinuteIndexChange: (value: number) => void;
  onSaveStartMode: (input: { startMode: RunningMatchRoomStartMode; slotStartAt?: string }) => void;
};

export function MatchRoomStartModeCard({
  startMode,
  saving,
  meridiem,
  hourIndex,
  minuteIndex,
  scheduledStartAt,
  onMeridiemChange,
  onHourIndexChange,
  onMinuteIndexChange,
  onSaveStartMode,
}: MatchRoomStartModeCardProps) {
  const handleMeridiemChange = useCallback((index: number) => {
    const nextMeridiem = index === 0 ? '오전' : '오후';
    onMeridiemChange(nextMeridiem);
    onSaveStartMode({
      startMode: 'scheduled',
      slotStartAt: buildScheduledStartAt(
        nextMeridiem,
        MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12,
        MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0,
      ),
    });
  }, [hourIndex, minuteIndex, onMeridiemChange, onSaveStartMode]);
  const handleHourChange = useCallback((index: number) => {
    onHourIndexChange(index);
    onSaveStartMode({
      startMode: 'scheduled',
      slotStartAt: buildScheduledStartAt(
        meridiem,
        MATCH_ROOM_HOUR_OPTIONS[index] ?? 12,
        MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0,
      ),
    });
  }, [meridiem, minuteIndex, onHourIndexChange, onSaveStartMode]);
  const handleMinuteChange = useCallback((index: number) => {
    onMinuteIndexChange(index);
    onSaveStartMode({
      startMode: 'scheduled',
      slotStartAt: buildScheduledStartAt(
        meridiem,
        MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12,
        MATCH_ROOM_MINUTE_OPTIONS[index] ?? 0,
      ),
    });
  }, [hourIndex, meridiem, onMinuteIndexChange, onSaveStartMode]);
  const startModeChips = useMemo(() => START_MODE_OPTIONS.map((option) => (
    <StartModeChip
      key={option.key}
      option={option}
      selected={startMode === option.key}
      saving={saving}
      onSaveStartMode={onSaveStartMode}
    />
  )), [onSaveStartMode, saving, startMode]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>시작 방식</Text>
      <View style={styles.modeRow}>
        {startModeChips}
      </View>

      {startMode === 'scheduled' ? (
        <View style={styles.scheduleBox}>
          <Text style={styles.scheduleTitle}>시작할 시간을 선택해주세요</Text>
          <View style={styles.wheelRow}>
            <MatchRoomWheelColumn
              options={MERIDIEM_OPTIONS}
              selectedIndex={meridiem === '오전' ? 0 : 1}
              onChange={handleMeridiemChange}
              width={96}
            />
            <MatchRoomWheelColumn
              options={MATCH_ROOM_HOUR_OPTIONS}
              selectedIndex={hourIndex}
              onChange={handleHourChange}
              width={84}
            />
            <MatchRoomWheelColumn
              options={MATCH_ROOM_MINUTE_OPTIONS}
              selectedIndex={minuteIndex}
              onChange={handleMinuteChange}
              width={84}
              formatLabel={formatMinuteWheelLabel}
            />
          </View>
          <Text style={styles.helperText}>선택한 시간은 {formatRoomDateLabel(scheduledStartAt)} 기준으로 저장돼요.</Text>
        </View>
      ) : null}
    </Card>
  );
}

const StartModeChip = memo(function StartModeChip({
  onSaveStartMode,
  option,
  saving,
  selected,
}: {
  onSaveStartMode: MatchRoomStartModeCardProps['onSaveStartMode'];
  option: typeof START_MODE_OPTIONS[number];
  saving: boolean;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSaveStartMode({ startMode: option.key });
  }, [onSaveStartMode, option.key]);

  return (
    <Pressable
      style={[styles.modeChip, selected ? styles.modeChipSelected : undefined]}
      onPress={handlePress}
      disabled={saving}
    >
      <Text style={[styles.modeChipText, selected ? styles.modeChipTextSelected : undefined]}>
        {option.label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingVertical: 12,
  },
  modeChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  modeChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  modeChipTextSelected: {
    color: '#4338CA',
  },
  scheduleBox: {
    gap: 12,
    marginTop: 12,
  },
  scheduleTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  wheelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  helperText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
});
