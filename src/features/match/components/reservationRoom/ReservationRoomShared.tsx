import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// Shared presentational pieces for the duel/group reservation-room screens
// (previously duplicated per screen). Render-only: all state stays in the
// screens/hooks.

// Structural participant shape — both DuelReservationParticipant and
// GroupReservationParticipant satisfy it.
export type ReservationRoomParticipant = {
  id: string;
  name: string;
  badgeLabel: string | null;
  isSelf: boolean;
  statusLabel: string;
};

export const BackButton = memo(function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.backButton} onPress={onPress}>
      <Text style={styles.backText}>←</Text>
    </Pressable>
  );
});

const ReservationParticipantRow = memo(function ReservationParticipantRow({
  participant,
  highlighted,
}: {
  participant: ReservationRoomParticipant;
  // Brand-outlined row. Which side is highlighted is the callers' deliberate
  // asymmetry: the group room highlights 나 (isSelf), the duel room highlights
  // the opponent (!isSelf).
  highlighted: boolean;
}) {
  return (
    <View
      style={[styles.participantRow, highlighted ? styles.highlightedParticipantRow : undefined]}
    >
      <View style={styles.participantIdentity}>
        <Text style={styles.participantName}>{participant.name}</Text>
        {participant.badgeLabel ? (
          <Text style={participant.isSelf ? styles.selfBadge : styles.otherBadge}>
            {participant.badgeLabel}
          </Text>
        ) : null}
      </View>
      <Text style={styles.participantStatus}>{participant.statusLabel}</Text>
    </View>
  );
});

export const ReservationParticipantList = memo(function ReservationParticipantList({
  participants,
  highlightSelf,
  emptyText,
  helperText,
}: {
  participants: ReservationRoomParticipant[];
  // true → highlight 나 (group room); false → highlight the opponent (duel room).
  highlightSelf: boolean;
  // When provided, an empty roster renders this fallback copy instead of the list
  // (group room); when omitted the list container always renders (duel room's
  // fixed 나/상대 pair is never empty).
  emptyText?: string | null;
  helperText: string;
}) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>참가자 명단</Text>
      {emptyText != null && participants.length === 0 ? (
        <Text style={styles.helperText}>{emptyText}</Text>
      ) : (
        <View style={styles.participantList}>
          {participants.map((participant) => (
            <ReservationParticipantRow
              key={participant.id}
              participant={participant}
              highlighted={highlightSelf ? participant.isSelf : !participant.isSelf}
            />
          ))}
        </View>
      )}
      <Text style={styles.helperText}>{helperText}</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.brand,
    fontWeight: fontWeights.black,
    fontSize: fontSizes.summaryValue,
    lineHeight: 24,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  participantList: {
    gap: spacing.s10,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
  },
  // Identical values shipped as duel `opponentParticipantRow` / group `selfParticipantRow`.
  highlightedParticipantRow: {
    borderWidth: 1,
    borderColor: colors.brandLighter,
    backgroundColor: colors.brandWash,
  },
  participantIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  participantName: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  selfBadge: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  // Identical values shipped as duel `opponentBadge` / group `memberBadge`.
  otherBadge: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  participantStatus: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
});
