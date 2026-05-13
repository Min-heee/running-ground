import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { MatchRoomParticipantUxStatus, MatchRoomUxModel } from '@/features/runs/matchRoomFlow';
import type { RunningMatchRoom } from '@/lib/api/types';

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
  loadingText: {
    color: '#F79009',
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
