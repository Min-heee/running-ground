import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brandLight,
    backgroundColor: fixedColors.brandWash,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    gap: spacing.s12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s10,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  title: {
    marginTop: spacing.sm,
    color: fixedColors.textPrimary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.black,
    lineHeight: 23,
  },
  code: {
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.indigoInk,
    color: fixedColors.brandWash,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xl,
  },
  meta: {
    color: fixedColors.textMuted,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  declineButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderCool,
    backgroundColor: fixedColors.white,
    paddingVertical: 13,
  },
  acceptButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    paddingVertical: 13,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  declineText: {
    color: colors.slateMuted,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
  acceptText: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
});
