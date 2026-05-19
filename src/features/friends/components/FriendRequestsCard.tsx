import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItem } from 'react-native';

import { Card } from '@/components/Card';
import type { FriendRequest } from '@/domain';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type FriendRequestsCardProps = {
  received: FriendRequest[];
  pending: FriendRequest[];
  actionError: string | null;
  requestActionId: string | null;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onCancel: (requestId: string) => void;
};

type FriendRequestRowProps = {
  request: FriendRequest;
  requestActionId: string | null;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onCancel: (requestId: string) => void;
};

const ReceivedRequestRow = memo(function ReceivedRequestRow({
  request,
  requestActionId,
  onAccept,
  onReject,
}: Omit<FriendRequestRowProps, 'onCancel'>) {
  const isActing = requestActionId === request.id;
  const handleReject = useCallback(() => {
    onReject(request.id);
  }, [onReject, request.id]);
  const handleAccept = useCallback(() => {
    onAccept(request.id);
  }, [onAccept, request.id]);

  return (
    <View style={styles.requestRow}>
      <View style={styles.requestMeta}>
        <Text style={styles.requestName}>{request.name}</Text>
        <Text style={styles.requestDetail}>{request.tag} · 나에게 친구 요청 보냄</Text>
      </View>
      <View style={styles.requestActions}>
        <Pressable
          style={[styles.ghostButton, isActing && styles.disabledButton]}
          onPress={handleReject}
          disabled={isActing}
        >
          <Text style={styles.ghostButtonText}>거절</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptButton, isActing && styles.disabledButton]}
          onPress={handleAccept}
          disabled={isActing}
        >
          <Text style={styles.acceptButtonText}>{isActing ? '처리중' : '수락'}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const PendingRequestRow = memo(function PendingRequestRow({
  request,
  requestActionId,
  onCancel,
}: Pick<FriendRequestRowProps, 'request' | 'requestActionId' | 'onCancel'>) {
  const isActing = requestActionId === request.id;
  const handleCancel = useCallback(() => {
    onCancel(request.id);
  }, [onCancel, request.id]);

  return (
    <View style={styles.requestRow}>
      <View style={styles.requestMeta}>
        <Text style={styles.requestName}>{request.name}</Text>
        <Text style={styles.requestDetail}>{request.tag} · 수락 대기중</Text>
      </View>
      <View style={styles.requestActions}>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>대기중</Text>
        </View>
        <Pressable
          style={[styles.ghostButton, isActing && styles.disabledButton]}
          onPress={handleCancel}
          disabled={isActing}
        >
          <Text style={styles.ghostButtonText}>{isActing ? '취소중' : '취소'}</Text>
        </Pressable>
      </View>
    </View>
  );
});

export function FriendRequestsCard({
  received,
  pending,
  actionError,
  requestActionId,
  onAccept,
  onReject,
  onCancel,
}: FriendRequestsCardProps) {
  const keyExtractor = useCallback((request: FriendRequest) => request.id, []);
  const renderReceivedRequest = useCallback<ListRenderItem<FriendRequest>>(({ item }) => (
    <ReceivedRequestRow
      request={item}
      requestActionId={requestActionId}
      onAccept={onAccept}
      onReject={onReject}
    />
  ), [onAccept, onReject, requestActionId]);
  const renderPendingRequest = useCallback<ListRenderItem<FriendRequest>>(({ item }) => (
    <PendingRequestRow
      request={item}
      requestActionId={requestActionId}
      onCancel={onCancel}
    />
  ), [onCancel, requestActionId]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>친구 요청 상태</Text>
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      <FlatList
        data={received}
        keyExtractor={keyExtractor}
        renderItem={renderReceivedRequest}
        scrollEnabled={false}
      />
      <FlatList
        data={pending}
        keyExtractor={keyExtractor}
        renderItem={renderPendingRequest}
        scrollEnabled={false}
      />
      {received.length === 0 && pending.length === 0 ? (
        <Text style={styles.emptyText}>처리할 친구 요청이 없어.</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s12,
    gap: spacing.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  requestMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.xxl,
    alignItems: 'center',
  },
  requestName: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  requestDetail: {
    color: colors.textSecondary,
  },
  acceptButton: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xxl,
  },
  ghostButton: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  acceptButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  ghostButtonText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.extraBold,
  },
  pendingBadge: {
    backgroundColor: colors.brandWash,
    borderRadius: 12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xxl,
  },
  pendingBadgeText: {
    color: colors.brandStrong,
    fontWeight: fontWeights.extraBold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: spacing.s10,
  },
});
