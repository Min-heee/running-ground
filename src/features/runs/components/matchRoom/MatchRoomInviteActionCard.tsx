import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import { colors } from '@/theme/tokens';

type MatchRoomInviteActionCardProps = {
  invite: MatchRoomUxModel['invite'];
  saving: boolean;
  error: string | null;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
};

export function MatchRoomInviteActionCard({
  invite,
  saving,
  error,
  onAcceptInvite,
  onDeclineInvite,
}: MatchRoomInviteActionCardProps) {
  return (
    <Card style={styles.inviteActionCard}>
      <Text style={styles.inviteActionTitle}>{invite.title}</Text>
      <Text style={styles.helperText}>{invite.helperText}</Text>
      <View style={styles.inviteButtonRow}>
        <Pressable
          style={[
            styles.declineInviteButton,
            (saving || !invite.canDecline) ? styles.actionButtonDisabled : undefined,
          ]}
          onPress={onDeclineInvite}
          disabled={saving || !invite.canDecline}
        >
          <Text style={styles.declineInviteButtonText}>{saving ? '처리 중...' : '거절'}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.acceptInviteButton,
            (saving || !invite.canAccept) ? styles.actionButtonDisabled : undefined,
          ]}
          onPress={onAcceptInvite}
          disabled={saving || !invite.canAccept}
        >
          <Text style={styles.acceptInviteButtonText}>{saving ? '처리 중...' : '수락'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  inviteActionCard: {
    gap: 14,
  },
  inviteActionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  inviteButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptInviteButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: colors.brand,
    paddingVertical: 15,
  },
  acceptInviteButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  declineInviteButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 15,
  },
  declineInviteButtonText: {
    color: colors.textStrongMuted,
    fontSize: 16,
    fontWeight: '900',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.dangerBright,
    fontSize: 14,
    fontWeight: '700',
  },
});
