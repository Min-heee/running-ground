import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { MatchRoomParticipantUxStatus, MatchRoomUxModel } from '@/features/runs/lifecycle/matchRoomFlow';
import type { RunningMatchRoom } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type PartyRunParticipantListCardProps = {
  room: RunningMatchRoom;
  uxModel: MatchRoomUxModel;
  saving: boolean;
  onToggleReady: () => void;
  onStart: () => void;
};

type PartyRunParticipant = MatchRoomUxModel['participants'][number];

function getParticipantStatusStyle(status: MatchRoomParticipantUxStatus) {
  switch (status) {
    case 'host':
      return styles.hostStatusText;
    case 'ready':
    case 'countdown-ready':
      return styles.readyText;
    case 'countdown-loading':
      return styles.loadingText;
    case 'invite-pending':
      return styles.invitedStatusText;
    case 'waiting':
    default:
      return styles.pendingText;
  }
}

const PartyRunParticipantRow = memo(function PartyRunParticipantRow({
  participant,
}: {
  participant: PartyRunParticipant;
}) {
  return (
    <View
      style={[styles.participantRow, participant.isInvitee ? styles.invitedParticipantRow : undefined]}
    >
      <View style={styles.participantIdentity}>
        <Text style={styles.participantName}>{participant.name}</Text>
        {participant.badgeLabel ? (
          <Text style={participant.isInvitee ? styles.invitedBadge : styles.hostBadge}>
            {participant.badgeLabel}
          </Text>
        ) : null}
      </View>
      <Text style={getParticipantStatusStyle(participant.status)}>
        {participant.statusLabel}
      </Text>
    </View>
  );
});

export function PartyRunParticipantListCard({
  room,
  uxModel,
  saving,
  onToggleReady,
  onStart,
}: PartyRunParticipantListCardProps) {
  const { readyAction, startAction } = uxModel;
  const keyExtractor = useCallback((participant: PartyRunParticipant) => participant.id, []);
  const renderParticipant = useCallback<ListRenderItem<PartyRunParticipant>>(({ item }) => (
    <PartyRunParticipantRow participant={item} />
  ), []);

  return (
    <Card>
      <Text style={styles.sectionTitle}>참가자 명단</Text>
      <FlatList
        data={uxModel.participants}
        keyExtractor={keyExtractor}
        renderItem={renderParticipant}
        contentContainerStyle={styles.participantList}
        scrollEnabled={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
      />
      {readyAction.visible ? (
        <PrimaryButton
          label={saving ? '반영 중...' : readyAction.label ?? '준비'}
          onPress={onToggleReady}
          disabled={saving || !readyAction.canToggle}
        />
      ) : startAction.visible ? (
        <PrimaryButton
          label={saving ? '시작 준비 중...' : startAction.label ?? '시작'}
          onPress={onStart}
          disabled={saving || !startAction.canStart}
        />
      ) : (
        <Text style={styles.helperText}>{startAction.helperText}</Text>
      )}
      {readyAction.visible && readyAction.helperText ? <Text style={styles.helperText}>{readyAction.helperText}</Text> : null}
      {room.isHost && startAction.visible && startAction.helperText ? (
        <Text style={styles.helperText}>{startAction.helperText}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
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
  invitedParticipantRow: {
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
  hostBadge: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  invitedBadge: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  readyText: {
    color: colors.blueAccent,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  loadingText: {
    color: colors.warning,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  hostStatusText: {
    color: colors.brand,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  pendingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  invitedStatusText: {
    color: colors.brandDeep,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.black,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
});
