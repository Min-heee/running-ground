import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { FriendRank } from '@/domain';
import type { RunningMatchRoomMode } from '@/lib/api/types';

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
  return (
    <Card>
      <Text style={styles.sectionTitle}>친구 초대</Text>
      {friendOptions.length ? (
        <View style={styles.friendWrap}>
          {friendOptions.map((friend) => {
            const isSelected = selectedFriendIds.includes(friend.id);
            return (
              <Pressable
                key={friend.id}
                style={[styles.friendChip, isSelected ? styles.friendChipSelected : undefined]}
                onPress={() => {
                  const nextIds = isSelected
                    ? selectedFriendIds.filter((id) => id !== friend.id)
                    : mode === 'duel'
                      ? [friend.id]
                      : [...selectedFriendIds, friend.id].slice(0, maxParticipants - 1);
                  onSelectedFriendIdsChange(nextIds);
                }}
                disabled={saving}
              >
                <Text style={[styles.friendChipText, isSelected ? styles.friendChipTextSelected : undefined]}>
                  {friend.name}
                </Text>
              </Pressable>
            );
          })}
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

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  friendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  friendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  friendChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  friendChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  friendChipTextSelected: {
    color: '#4338CA',
  },
  inviteSubmitBox: {
    gap: 10,
    marginTop: 14,
  },
  sendInviteButton: {
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#6D5EF7',
    paddingVertical: 15,
  },
  sendInviteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  helperText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
});
