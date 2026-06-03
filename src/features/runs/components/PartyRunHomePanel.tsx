import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { PartyRunInviteCard } from '@/features/runs/components/PartyRunInviteCard';
import type {
  RunningMatchRoom,
  RunningMatchRoomMode,
} from '@/lib/api/types';
import { hydrateOptimisticMatchRoom } from '@/features/match/hooks/lobby/optimisticRoomHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
  onJoinRoom: () => Promise<void> | void;
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
    const roomForHydration = visibleRoom ?? currentRoom;
    if (isMatchRoomDeleted(roomForHydration?.roomId)) {
      rgPerfMark('room entry skipped deleted room', {
        roomId: roomForHydration?.roomId ?? null,
        source: 'party room entry button',
      });
      return;
    }

    const inputTrace = beginRgInputTrace('room lobby button press', {
      roomId: roomForHydration?.roomId ?? null,
      source: 'party room entry button',
    });
    const endNavigationTrace = rgPerfMeasureStart('navigation to lobby', {
      roomId: roomForHydration?.roomId ?? null,
      source: 'party room entry button',
    });
    hydrateOptimisticMatchRoom({
      room: roomForHydration,
      source: 'party room entry button',
    });
    inputTrace.markFeedback('navigation begin');
    router.push('/match-room' as Href);
    endNavigationTrace({ success: true });
  }, [currentRoom, visibleRoom]);

  const roomModeChips = useMemo(() => (
    ROOM_MODE_OPTIONS.map((option) => {
      const optionIsSelected = roomMode === option.key;

      return (
        <Pressable
          key={option.key}
          style={[styles.roomModeChip, optionIsSelected ? styles.roomModeChipSelected : undefined]}
          onPress={() => {
            const trace = beginRgInputTrace('run mode select', {
              mode: option.key,
              source: 'party run room mode',
            });
            onRoomModeChange(option.key);
            trace.markFeedback('mode state dispatch');
          }}
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
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  onFocus={() => {
                    beginRgInputTrace('invite code input focus', {
                      hasToken: inviteTokenInput.trim().length > 0,
                      source: 'party run home panel',
                    }).markFeedback('input focused');
                  }}
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
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brandLight,
    backgroundColor: colors.brandWash,
    paddingVertical: spacing.s14,
  },
  partyRoomEntryButtonText: {
    color: colors.brandDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  roomCard: {
    gap: spacing.s14,
  },
  roomModeRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  roomModeChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slateMuted,
    backgroundColor: colors.textPrimary,
    paddingVertical: spacing.s14,
  },
  roomModeChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.purpleInk,
  },
  roomModeChipText: {
    color: colors.borderMuted,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
  roomModeChipTextSelected: {
    color: colors.white,
  },
  roomJoinBox: {
    gap: spacing.s10,
  },
  roomPickerTitle: {
    color: colors.borderMuted,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  roomInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slateMuted,
    backgroundColor: colors.slateDark,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
});
