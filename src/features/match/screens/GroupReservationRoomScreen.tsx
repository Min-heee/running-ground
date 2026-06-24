import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { LiveGapPushCard } from '@/features/runs/components/matchSetupCards/LiveGapPushCard';
import { useGroupReservationRoom } from '@/features/match/hooks/useGroupReservationRoom';
import { useReservationArenaHandoff } from '@/features/match/hooks/useReservationArenaHandoff';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';
import type { GroupReservationParticipant } from '@/features/runs/lifecycle/matchStateMachine';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

function parseNumberParam(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

export default function GroupReservationRoomScreen() {
  const params = useLocalSearchParams<{
    matchId?: string;
    distanceKm?: string;
    slotStartAt?: string;
    participantCount?: string;
    isTestMatch?: string;
  }>();

  const matchId = parseStringParam(params.matchId);
  const distanceKm = parseNumberParam(params.distanceKm);
  const slotStartAt = parseStringParam(params.slotStartAt);
  const participantCount = parseNumberParam(params.participantCount);
  const isTestMatch = params.isTestMatch === '1';

  const {
    loading,
    error,
    isCanceling,
    view,
    cancel,
  } = useGroupReservationRoom({ matchId, distanceKm, slotStartAt, participantCount, isTestMatch });

  // A few seconds before the runtime's ≤20s arena window, hand off to the running tab so
  // the live arena mounts UNDER this same countdown overlay (proven running-tab flow);
  // the race then starts at 0 with no transition. Suspended while a cancel is settling.
  useReservationArenaHandoff({
    mode: 'group',
    matchId,
    distanceKm,
    slotStartAt,
    isTestMatch,
    remainingSeconds: view.reservation.remainingSeconds,
    enabled: !isCanceling,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleCancel = useCallback(() => {
    void (async () => {
      const ok = await cancel();
      if (ok) {
        router.back();
      }
    })();
  }, [cancel]);

  const { reservation } = view;
  const startTimeLabel = view.startTimeLabel ? formatRoomDateLabel(view.startTimeLabel) : null;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <BackButton onPress={handleBack} />
      </View>
      <Text style={styles.pageTitle}>대기실</Text>

      {loading && !matchId ? (
        <Card>
          <Text style={styles.emptyTitle}>예약을 찾을 수 없어요</Text>
          <Text style={styles.helperText}>러닝 탭의 다가오는 매치에서 다시 들어와 주세요.</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryHeading}>
                <Text style={styles.summaryModeTitle}>
                  {view.isTestMatch ? '테스트 그룹 대결' : '그룹 대결'}
                </Text>
                <Text style={styles.summaryMeta}>인원 · {view.participantCountLabel}</Text>
                <Text style={styles.summaryMeta}>거리 · {view.distanceLabel}</Text>
                {startTimeLabel ? (
                  <Text style={styles.summaryMeta}>시작 시간 · {startTimeLabel} 시작</Text>
                ) : null}
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{reservation.statusLabel}</Text>
              </View>
            </View>
            <Text style={styles.autoStartNotice}>{view.autoStartNotice}</Text>
          </Card>

          <GroupReservationParticipantList participants={view.participants} />

          <LiveGapPushCard mode="group" />

          {error ? (
            <Card>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          ) : null}

          {view.cancelLocked ? (
            <Text style={styles.cancelHelperText}>출발 1시간 전부터는 취소할 수 없어요.</Text>
          ) : (
            <SecondaryButton
              label={isCanceling ? '취소 중...' : '그룹 예약 취소'}
              onPress={handleCancel}
              disabled={isCanceling}
            />
          )}
        </>
      )}

      {reservation.shouldShowStartOverlay && reservation.remainingSeconds !== null ? (
        <MatchStartCountdownOverlay
          countdownKey={`group-reservation-room-${view.startTimeLabel ?? 'slot'}`}
          secondsRemaining={reservation.remainingSeconds}
          variant="centered"
        />
      ) : null}
    </Screen>
  );
}

const BackButton = memo(function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.backButton} onPress={onPress}>
      <Text style={styles.backText}>←</Text>
    </Pressable>
  );
});

const GroupReservationParticipantRow = memo(function GroupReservationParticipantRow({
  participant,
}: {
  participant: GroupReservationParticipant;
}) {
  return (
    <View
      style={[styles.participantRow, participant.isSelf ? styles.selfParticipantRow : undefined]}
    >
      <View style={styles.participantIdentity}>
        <Text style={styles.participantName}>{participant.name}</Text>
        {participant.badgeLabel ? (
          <Text style={participant.isSelf ? styles.selfBadge : styles.memberBadge}>
            {participant.badgeLabel}
          </Text>
        ) : null}
      </View>
      <Text style={styles.participantStatus}>{participant.statusLabel}</Text>
    </View>
  );
});

const GroupReservationParticipantList = memo(function GroupReservationParticipantList({
  participants,
}: {
  participants: GroupReservationParticipant[];
}) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>참가자 명단</Text>
      {participants.length ? (
        <View style={styles.participantList}>
          {participants.map((participant) => (
            <GroupReservationParticipantRow key={participant.id} participant={participant} />
          ))}
        </View>
      ) : (
        <Text style={styles.helperText}>참가자 명단을 불러오는 중이에요.</Text>
      )}
      <Text style={styles.helperText}>예약된 그룹 대결은 시작 시간에 자동으로 시작돼요.</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
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
  pageTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  summaryCard: {
    gap: spacing.s14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  summaryHeading: {
    flex: 1,
    gap: spacing.xxs,
  },
  summaryModeTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
  },
  summaryMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  statusPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  statusPillText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  autoStartNotice: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
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
  selfParticipantRow: {
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
  memberBadge: {
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
  cancelHelperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.dangerBright,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});
