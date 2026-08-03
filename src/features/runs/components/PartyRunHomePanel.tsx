import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Href, router } from 'expo-router';
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

      {/* 오너 확정 2026-07-31 (파티런 '다'안, 순서 반전): 초대 코드 입장이 위의 보라 틴트
          블록, 방 만들기(솔리드 CTA)는 이 패널 아래 readyAction이 그린다 — 혼자 탭과 같은
          '진솔리드 / 보라틴트' 두 층 구조. 입력과 입장 버튼은 한 줄로 붙여 세로를 아낀다. */}
      {isSelected && !currentRoom ? (
        <View style={styles.joinBlock}>
          <Text style={styles.joinBlockTitle}>초대 코드로 입장</Text>
          <View style={styles.joinRow}>
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
            <Pressable
              style={({ pressed }) => [
                styles.joinButton,
                isJoining ? styles.joinButtonDisabled : undefined,
                pressed && !isJoining ? styles.joinButtonPressed : undefined,
              ]}
              onPress={onJoinRoom}
              disabled={isJoining}
              accessibilityRole="button"
            >
              <Text style={styles.joinButtonText}>{isJoining ? '입장 중' : '입장'}</Text>
            </Pressable>
          </View>
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
  // 혼자 탭에서 확정한 보라 유리 틴트(2fc0f25) 그대로 — 앱 전체가 같은 두 층 언어를 쓴다.
  joinBlock: {
    gap: spacing.s10,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    backgroundColor: colors.surface,
  },
  joinBlockTitle: {
    color: colors.brandDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  joinRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  roomInput: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  joinButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s18,
    borderRadius: radii.lg,
    backgroundColor: fixedColors.brand,
  },
  joinButtonPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: fixedColors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
