import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';

type PartyRunInviteCardProps = {
  room: RunningMatchRoom;
  isAccepting: boolean;
  isDeclining: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function PartyRunInviteCard({
  room,
  isAccepting,
  isDeclining,
  onAccept,
  onDecline,
}: PartyRunInviteCardProps) {
  const isBusy = isAccepting || isDeclining;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>파티런 초대</Text>
          <Text style={styles.title}>
            {room.hostName}님이 {room.mode === 'duel' ? '1대1 대결' : '그룹 대결'}에 초대했어요
          </Text>
        </View>
        <Text style={styles.code}>{room.inviteToken}</Text>
      </View>
      <Text style={styles.meta}>
        {room.distanceKm.toFixed(1)}km · {room.startMode === 'host' ? '방장 시작' : room.slotLabel}
      </Text>
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.declineButton, isBusy ? styles.buttonDisabled : undefined]}
          onPress={onDecline}
          disabled={isBusy}
        >
          <Text style={styles.declineText}>{isDeclining ? '처리 중...' : '거절'}</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptButton, isBusy ? styles.buttonDisabled : undefined]}
          onPress={onAccept}
          disabled={isBusy}
        >
          <Text style={styles.acceptText}>{isAccepting ? '입장 중...' : '수락'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  eyebrow: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    marginTop: 4,
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  code: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#1E1B4B',
    color: '#EEF2FF',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  meta: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  declineButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
  },
  acceptButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#6D5EF7',
    paddingVertical: 13,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  declineText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '900',
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
