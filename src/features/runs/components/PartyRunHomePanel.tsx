import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { PartyRunInviteCard } from '@/features/runs/components/PartyRunInviteCard';
import type {
  RunningMatchRoom,
  RunningMatchRoomMode,
} from '@/lib/api/types';
import { hydrateOptimisticMatchRoom } from '@/features/match/hooks/lobby/optimisticRoomHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
              {/* 보라 틴트: 버튼임을 드러내되, 아래 '방 만들기' 솔리드 CTA와 위계는 구분. */}
              <Button
                variant="tinted"
                label={isJoining ? '입장 중...' : '방 입장'}
                onPress={onJoinRoom}
                disabled={isJoining}
              />
            </View>
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
    backgroundColor: fixedColors.brandWash,
    paddingVertical: spacing.s14,
  },
  partyRoomEntryButtonText: {
    color: fixedColors.brandDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  roomCard: {
    gap: spacing.s14,
  },
  roomJoinBox: {
    gap: spacing.s10,
  },
  roomPickerTitle: {
    color: fixedColors.borderMuted,
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
