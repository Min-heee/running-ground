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
  return (
    <Card>
      <Text style={styles.sectionTitle}>시작 방식</Text>
      <View style={styles.modeRow}>
        {([
          { key: 'host' as const, label: '방장 시작' },
          { key: 'scheduled' as const, label: '예약 시작' },
        ]).map((option) => {
          const isSelected = startMode === option.key;
          return (
            <Pressable
              key={option.key}
              style={[styles.modeChip, isSelected ? styles.modeChipSelected : undefined]}
              onPress={() => onSaveStartMode({ startMode: option.key })}
              disabled={saving}
            >
              <Text style={[styles.modeChipText, isSelected ? styles.modeChipTextSelected : undefined]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {startMode === 'scheduled' ? (
        <View style={styles.scheduleBox}>
          <Text style={styles.scheduleTitle}>시작할 시간을 선택해주세요</Text>
          <View style={styles.wheelRow}>
            <MatchRoomWheelColumn
              options={['오전', '오후']}
              selectedIndex={meridiem === '오전' ? 0 : 1}
              onChange={(index) => {
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
              }}
              width={96}
            />
            <MatchRoomWheelColumn
              options={MATCH_ROOM_HOUR_OPTIONS}
              selectedIndex={hourIndex}
              onChange={(index) => {
                onHourIndexChange(index);
                onSaveStartMode({
                  startMode: 'scheduled',
                  slotStartAt: buildScheduledStartAt(
                    meridiem,
                    MATCH_ROOM_HOUR_OPTIONS[index] ?? 12,
                    MATCH_ROOM_MINUTE_OPTIONS[minuteIndex] ?? 0,
                  ),
                });
              }}
              width={84}
            />
            <MatchRoomWheelColumn
              options={MATCH_ROOM_MINUTE_OPTIONS}
              selectedIndex={minuteIndex}
              onChange={(index) => {
                onMinuteIndexChange(index);
                onSaveStartMode({
                  startMode: 'scheduled',
                  slotStartAt: buildScheduledStartAt(
                    meridiem,
                    MATCH_ROOM_HOUR_OPTIONS[hourIndex] ?? 12,
                    MATCH_ROOM_MINUTE_OPTIONS[index] ?? 0,
                  ),
                });
              }}
              width={84}
              formatLabel={(value) => `${value}`.padStart(2, '0')}
            />
          </View>
          <Text style={styles.helperText}>선택한 시간은 {formatRoomDateLabel(scheduledStartAt)} 기준으로 저장돼요.</Text>
        </View>
      ) : null}
    </Card>
  );
}

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
