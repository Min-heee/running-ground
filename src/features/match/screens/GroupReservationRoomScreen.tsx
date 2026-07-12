import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { LiveGapPushCard } from '@/features/runs/components/matchSetupCards/LiveGapPushCard';
import { useGroupReservationRoom } from '@/features/match/hooks/useGroupReservationRoom';
import { useReservationArenaHandoff } from '@/features/match/hooks/useReservationArenaHandoff';
import {
  parseNumberParam,
  parseStringParam,
} from '@/features/match/components/reservationRoom/reservationRoomParams';
import {
  BackButton,
  ReservationParticipantList,
} from '@/features/match/components/reservationRoom/ReservationRoomShared';
import { reservationRoomScreenStyles as styles } from '@/features/match/components/reservationRoom/reservationRoomStyles';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';

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
    countdownOverlay,
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

          <ReservationParticipantList
            participants={view.participants}
            highlightSelf
            emptyText="참가자 명단을 불러오는 중이에요."
            helperText="예약된 그룹 대결은 시작 시간에 자동으로 시작돼요."
          />

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

      {countdownOverlay ? (
        <MatchStartCountdownOverlay
          countdownKey={countdownOverlay.countdownKey}
          secondsRemaining={countdownOverlay.secondsRemaining}
          targetMs={countdownOverlay.targetMs}
          variant="centered"
        />
      ) : null}
    </Screen>
  );
}
