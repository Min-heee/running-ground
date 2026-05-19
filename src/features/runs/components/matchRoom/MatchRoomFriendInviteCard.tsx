import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { FriendRank } from '@/domain';
import type { RunningMatchRoomMode } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type MatchRoomFriendInviteCardProps = {
  mode: RunningMatchRoomMode;
  maxParticipants: number;
  friendOptions: FriendRank[];
  selectedFriendIds: string[];
  saving: boolean;
  hasInviteDraftChanges: boolean;
  onSelectedFriendIdsChange: (ids: string[]) => void;
  onSendFriendInvites: () => void;
};

export function MatchRoomFriendInviteCard({
  mode,
  maxParticipants,
  friendOptions,
  selectedFriendIds,
  saving,
  hasInviteDraftChanges,
  onSelectedFriendIdsChange,
  onSendFriendInvites,
}: MatchRoomFriendInviteCardProps) {
  const selectedFriendIdSet = useMemo(() => new Set(selectedFriendIds), [selectedFriendIds]);
  const handleToggleFriend = useCallback((friendId: string, isSelected: boolean) => {
    const nextIds = isSelected
      ? selectedFriendIds.filter((id) => id !== friendId)
      : mode === 'duel'
        ? [friendId]
        : [...selectedFriendIds, friendId].slice(0, maxParticipants - 1);
    onSelectedFriendIdsChange(nextIds);
  }, [maxParticipants, mode, onSelectedFriendIdsChange, selectedFriendIds]);
  const friendChips = useMemo(() => friendOptions.map((friend) => (
    <FriendInviteChip
      key={friend.id}
      friend={friend}
      isSelected={selectedFriendIdSet.has(friend.id)}
      saving={saving}
      onToggleFriend={handleToggleFriend}
    />
  )), [friendOptions, handleToggleFriend, saving, selectedFriendIdSet]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>친구 초대</Text>
      {friendOptions.length ? (
        <View style={styles.friendWrap}>
          {friendChips}
        </View>
      ) : (
        <Text style={styles.helperText}>친구 목록이 아직 없으면 링크 공유로 초대하면 돼요.</Text>
      )}
      {friendOptions.length ? (
        <View style={styles.inviteSubmitBox}>
          <Text style={styles.helperText}>
            친구 이름을 눌러 선택한 뒤 초대하기를 누르면 대기명단에 수락 대기중으로 표시돼요.
          </Text>
          <Pressable
            style={[
              styles.sendInviteButton,
              (saving || !hasInviteDraftChanges) ? styles.actionButtonDisabled : undefined,
            ]}
            onPress={onSendFriendInvites}
            disabled={saving || !hasInviteDraftChanges}
          >
            <Text style={styles.sendInviteButtonText}>
              {saving ? '초대 반영 중...' : selectedFriendIds.length ? `${selectedFriendIds.length}명 초대하기` : '초대 비우기'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const FriendInviteChip = memo(function FriendInviteChip({
  friend,
  isSelected,
  onToggleFriend,
  saving,
}: {
  friend: FriendRank;
  isSelected: boolean;
  onToggleFriend: (friendId: string, isSelected: boolean) => void;
  saving: boolean;
}) {
  const handlePress = useCallback(() => {
    onToggleFriend(friend.id, isSelected);
  }, [friend.id, isSelected, onToggleFriend]);

  return (
    <Pressable
      style={[styles.friendChip, isSelected ? styles.friendChipSelected : undefined]}
      onPress={handlePress}
      disabled={saving}
    >
      <Text style={[styles.friendChipText, isSelected ? styles.friendChipTextSelected : undefined]}>
        {friend.name}
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
  friendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s10,
  },
  friendChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    backgroundColor: colors.white,
  },
  friendChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.brandWash,
  },
  friendChipText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.bold,
  },
  friendChipTextSelected: {
    color: colors.brandDeep,
  },
  inviteSubmitBox: {
    gap: spacing.s10,
    marginTop: spacing.s14,
  },
  sendInviteButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    paddingVertical: 15,
  },
  sendInviteButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
});
