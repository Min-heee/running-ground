import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { PartyRunInviteCard } from '@/features/runs/components/PartyRunInviteCard';
import type {
  RunningMatchRoom,
  RunningMatchRoomMode,
} from '@/lib/api/types';
import { rgPerfMeasureStart } from '@/utils/rgPerfTrace';

type PartyRunHomePanelProps = {
  visibleRoom: RunningMatchRoom | null;
  currentRoom: RunningMatchRoom | null;
  isSelected: boolean;
  isInviteOnly: boolean;
  isJoining: boolean;
  isLeaving: boolean;
  roomMode: RunningMatchRoomMode;
  inviteTokenInput: string;
  onRoomModeChange: (mode: RunningMatchRoomMode) => void;
  onInviteTokenChange: (value: string) => void;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  onJoinRoom: () => void;
};

const ROOM_MODE_OPTIONS = [
  { key: 'duel' as const, label: '1대1 대결' },
  { key: 'group' as const, label: '그룹 대결' },
];

export function PartyRunHomePanel({
  visibleRoom,
  currentRoom,
  isSelected,
  isInviteOnly,
  isJoining,
  isLeaving,
  roomMode,
  inviteTokenInput,
  onRoomModeChange,
  onInviteTokenChange,
  onAcceptInvite,
  onDeclineInvite,
  onJoinRoom,
}: PartyRunHomePanelProps) {
  const handleOpenMatchRoom = useCallback(() => {
    const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
      roomId: visibleRoom?.roomId ?? currentRoom?.roomId ?? null,
      source: 'party room entry button',
    });
    router.push('/match-room' as Href);
    endNavigationTrace({ success: true });
  }, [currentRoom?.roomId, visibleRoom?.roomId]);

  const roomModeChips = useMemo(() => (
    ROOM_MODE_OPTIONS.map((option) => {
      const optionIsSelected = roomMode === option.key;

      return (
        <Pressable
          key={option.key}
          style={[styles.roomModeChip, optionIsSelected ? styles.roomModeChipSelected : undefined]}
          onPress={() => onRoomModeChange(option.key)}
        >
          <Text style={[styles.roomModeChipText, optionIsSelected ? styles.roomModeChipTextSelected : undefined]}>
            {option.label}
          </Text>
        </Pressable>
      );
    })
  ), [onRoomModeChange, roomMode]);

  return (
    <>
      {visibleRoom ? (
        isInviteOnly ? (
          <PartyRunInviteCard
            room={visibleRoom}
            isAccepting={isJoining}
            isDeclining={isLeaving}
            onAccept={onAcceptInvite}
            onDecline={onDeclineInvite}
          />
        ) : (
          <Pressable
            style={styles.partyRoomEntryButton}
            onPress={handleOpenMatchRoom}
          >
            <Text style={styles.partyRoomEntryButtonText}>파티런 대기실로 가기</Text>
          </Pressable>
        )
      ) : null}

      {isSelected ? (
        <View style={styles.roomCard}>
          {!currentRoom ? (
            <>
              <View style={styles.roomModeRow}>
                {roomModeChips}
              </View>
              <View style={styles.roomJoinBox}>
                <Text style={styles.roomPickerTitle}>초대 코드로 입장</Text>
                <TextInput
                  value={inviteTokenInput}
                  onChangeText={onInviteTokenChange}
                  placeholder="예: AB12CD"
                  placeholderTextColor="#98A2B3"
                  autoCapitalize="characters"
                  style={styles.roomInput}
                />
                <SecondaryButton
                  label={isJoining ? '입장 중...' : '방 입장'}
                  onPress={onJoinRoom}
                  disabled={isJoining}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  partyRoomEntryButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
    paddingVertical: 14,
  },
  partyRoomEntryButtonText: {
    color: '#4338CA',
    fontSize: 16,
    fontWeight: '900',
  },
  roomCard: {
    gap: 14,
  },
  roomModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roomModeChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingVertical: 14,
  },
  roomModeChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#282061',
  },
  roomModeChipText: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '900',
  },
  roomModeChipTextSelected: {
    color: '#FFFFFF',
  },
  roomJoinBox: {
    gap: 10,
  },
  roomPickerTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
  },
  roomInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
