import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type {
  RunningMatchRoom,
  RunningMatchRoomInvitee,
} from '@/lib/api/types';

type PartyRunParticipantListCardProps = {
  room: RunningMatchRoom;
  pendingInvitees: RunningMatchRoomInvitee[];
  saving: boolean;
  isReady: boolean;
  allGuestsReady: boolean;
  onToggleReady: () => void;
  onStart: () => void;
};

export function PartyRunParticipantListCard({
  room,
  pendingInvitees,
  saving,
  isReady,
  allGuestsReady,
  onToggleReady,
  onStart,
}: PartyRunParticipantListCardProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>참가자 명단</Text>
      <View style={styles.participantList}>
        {room.participants.map((participant, index) => (
          <View key={`${participant.userId}-${index}`} style={styles.participantRow}>
            <View style={styles.participantIdentity}>
              <Text style={styles.participantName}>{participant.name}</Text>
              {participant.isHost ? <Text style={styles.hostBadge}>방장</Text> : null}
            </View>
            <Text style={participant.isHost ? styles.hostStatusText : (participant.isReady ? styles.readyText : styles.pendingText)}>
              {room.linkedMatchId
                ? (participant.isCountdownReady ? '로딩 완료' : '로딩 중')
                : participant.isHost
                  ? '시작 권한'
                  : (participant.isReady ? '준비 완료' : '대기 중')}
            </Text>
          </View>
        ))}
        {pendingInvitees.map((invitee) => (
          <View key={`invitee-${invitee.userId}`} style={[styles.participantRow, styles.invitedParticipantRow]}>
            <View style={styles.participantIdentity}>
              <Text style={styles.participantName}>{invitee.name}</Text>
              <Text style={styles.invitedBadge}>초대됨</Text>
            </View>
            <Text style={styles.invitedStatusText}>수락 대기중</Text>
          </View>
        ))}
      </View>
      {!room.isHost && !room.linkedMatchId ? (
        <PrimaryButton
          label={saving ? '반영 중...' : isReady ? '준비 취소' : '준비'}
          onPress={onToggleReady}
          disabled={saving}
        />
      ) : room.isHost && room.startMode === 'host' && !room.linkedMatchId ? (
        <PrimaryButton
          label={saving ? '시작 준비 중...' : '시작'}
          onPress={onStart}
          disabled={saving || !room.canStart}
        />
      ) : room.state === 'arming' ? (
        <Text style={styles.helperText}>모든 기기가 카운트다운 준비를 마치면 함께 시작 카운트다운이 보여요.</Text>
      ) : room.linkedMatchId ? (
        <Text style={styles.helperText}>카운트다운이 시작되면 자동으로 대결 화면으로 이동해요.</Text>
      ) : (
        <Text style={styles.helperText}>예약 시간 30초 전에 카운트다운이 시작돼요.</Text>
      )}
      {room.isHost && room.startMode === 'host' && !room.canStart ? (
        <Text style={styles.helperText}>
          {allGuestsReady
            ? `최소 ${room.minParticipants}명은 모여야 시작할 수 있어요.`
            : '모든 참가자가 준비 완료해야 시작할 수 있어요.'}
        </Text>
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
  participantList: {
    gap: 10,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  invitedParticipantRow: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  participantIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  hostBadge: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '800',
  },
  invitedBadge: {
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '800',
  },
  readyText: {
    color: '#1570EF',
    fontSize: 14,
    fontWeight: '800',
  },
  hostStatusText: {
    color: '#6D5EF7',
    fontSize: 14,
    fontWeight: '800',
  },
  pendingText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '700',
  },
  invitedStatusText: {
    color: '#4338CA',
    fontSize: 14,
    fontWeight: '900',
  },
  helperText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
});
