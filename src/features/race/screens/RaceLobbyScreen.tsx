import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StateMessageCard } from '@/components/ui/StateMessageCard';
import type { OfflineRaceEvent } from '@/domain/match';
import {
  formatRaceStartLabel,
  isRaceLobbyOpen,
  resolveRaceArenaHandoffTarget,
  shouldRefetchForRaceFormation,
} from '@/features/race/raceHubModel';
import { useReservationArenaHandoff } from '@/features/match/hooks/useReservationArenaHandoff';
import { isGlobalTrackerBusy } from '@/features/runs/tracking/globalTrackerActivity';
import { fetchOfflineRaceHub } from '@/lib/api/services/races';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 레이스 대기실 (오너 2026-08-13): 대기자 명단 없는 참가자 대기 공간 — 인원이 많아도 화면이
// 안 무너진다(참가 인원 수만 표시). 출발 24시간 전에 열리고, 홈 예약 카드와 레이스 탭 모집
// 카드에서 들어온다. 편성이 끝나고 출발 25초 안이면 예약 방/홈/레이스 탭과 같은 핸드오프로
// 러닝 탭 아레나에 자동 진입한다 — 여기서 기다리기만 하면 출발까지 전부 자동이다.

type LobbyState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; event: OfflineRaceEvent };

function formatDistanceLabel(distanceKm: number): string {
  return Number.isInteger(distanceKm) ? `${distanceKm}km` : `${distanceKm.toFixed(2)}km`;
}

// 출발까지 라이브 카운트다운 — 24시간 창 안이므로 HH:MM:SS면 충분하다.
function formatRemainingLabel(startsAt: string, nowMs: number): string {
  const remainingMs = Date.parse(startsAt) - nowMs;

  if (!Number.isFinite(remainingMs)) {
    return '--:--:--';
  }

  if (remainingMs <= 0) {
    return '출발!';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function RaceLobbyScreen() {
  const { raceId } = useLocalSearchParams<{ raceId?: string }>();
  const [state, setState] = useState<LobbyState>({ status: 'loading' });
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadEvent = useCallback(async () => {
    if (!raceId) {
      setState({ status: 'error' });
      return;
    }

    try {
      const hub = await fetchOfflineRaceHub();
      const event = [hub.featuredEvent, ...hub.upcomingEvents]
        .filter((entry): entry is OfflineRaceEvent => entry !== null)
        .find((entry) => entry.id === raceId);
      setState(event ? { status: 'ready', event } : { status: 'error' });
    } catch {
      setState((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
    }
  }, [raceId]);

  useFocusEffect(
    useCallback(() => {
      void loadEvent();
    }, [loadEvent]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 편성 임박 재조회 — 레이스 탭과 같은 20초 스로틀 (허브 GET이 서버 편성 스윕을 겸한다).
  const lastFormationRefetchMsRef = useRef(0);
  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    if (!shouldRefetchForRaceFormation([state.event], nowMs)) {
      return;
    }

    if (nowMs - lastFormationRefetchMsRef.current < 20_000) {
      return;
    }

    lastFormationRefetchMsRef.current = nowMs;
    void loadEvent();
  }, [loadEvent, nowMs, state]);

  // 출발 25초 전 아레나 자동 진입 — 예약 방/홈/레이스 탭과 같은 계약 (기록 중이면 포기).
  const handoffTarget = useMemo(
    () => (state.status === 'ready' ? resolveRaceArenaHandoffTarget([state.event], nowMs) : null),
    [nowMs, state],
  );
  useReservationArenaHandoff({
    mode: 'group',
    matchId: handoffTarget?.matchId ?? null,
    distanceKm: handoffTarget?.distanceKm ?? null,
    slotStartAt: handoffTarget?.slotStartAt ?? null,
    isTestMatch: false,
    remainingSeconds: handoffTarget?.remainingSeconds ?? null,
    enabled: !isGlobalTrackerBusy(),
  });

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/race');
  }, []);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
      </View>
      <Text style={styles.pageTitle}>레이스 대기실</Text>

      {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {state.status === 'error' ? (
        <StateMessageCard
          title="대기실을 불러오지 못했어요"
          message="레이스 탭에서 다시 들어와 주세요."
        />
      ) : null}

      {state.status === 'ready' ? (
        isRaceLobbyOpen(state.event.startsAt, nowMs) ? (
          <>
            <Card style={styles.heroCard}>
              <Text style={styles.eventTitle}>{state.event.title}</Text>
              {state.event.subtitle ? <Text style={styles.eventSubtitle}>{state.event.subtitle}</Text> : null}
              <Text style={styles.countdownLabel}>출발까지</Text>
              <Text style={styles.countdown}>{formatRemainingLabel(state.event.startsAt, nowMs)}</Text>
              <View style={styles.metaBlock}>
                <MetaRow label="일시" value={formatRaceStartLabel(state.event.startsAt)} />
                <MetaRow label="거리" value={formatDistanceLabel(state.event.distanceKm)} />
                <MetaRow label="참가" value={`${state.event.participantCount}명`} />
              </View>
            </Card>

            <Card style={styles.guideCard}>
              <Text style={styles.guideTitle}>출발 준비</Text>
              <Text style={styles.guideLine}>1. 출발 5분 전에는 핸드폰을 켜고 앱을 열어 두세요.</Text>
              <Text style={styles.guideLine}>2. 출발 25초 전, 여기서 자동으로 출발선(아레나)으로 이동해요.</Text>
              <Text style={styles.guideLine}>3. 전원 동시 카운트다운 후 정각에 출발! 출발 후 1분은 화면을 켠 채 달려 주세요.</Text>
              {!state.event.registered ? (
                <Text style={styles.guideNotice}>아직 신청 전이에요 — 레이스 탭에서 신청해야 함께 출발할 수 있어요.</Text>
              ) : null}
            </Card>
          </>
        ) : Date.parse(state.event.startsAt) <= nowMs ? (
          <StateMessageCard
            title="레이스가 이미 출발했어요"
            message="진행 중이라면 홈의 예약 카드에서 대결 보기로 들어가 주세요."
          />
        ) : (
          <StateMessageCard
            title="대기실은 출발 24시간 전에 열려요"
            message={`${formatRaceStartLabel(state.event.startsAt)} 출발 — 하루 전부터 여기서 함께 기다릴 수 있어요.`}
          />
        )
      ) : null}
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backText: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.bold,
  },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.black,
  },
  heroCard: {
    gap: spacing.s10,
  },
  eventTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.display,
    fontWeight: fontWeights.black,
  },
  eventSubtitle: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  countdownLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    marginTop: spacing.s10,
  },
  countdown: {
    color: colors.brand,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    fontWeight: fontWeights.black,
  },
  metaBlock: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    marginTop: spacing.s10,
    paddingTop: spacing.s12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  metaValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  guideCard: {
    gap: spacing.s10,
  },
  guideTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  guideLine: {
    color: colors.textSecondary,
    lineHeight: 22,
  },
  guideNotice: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    overflow: 'hidden',
    padding: spacing.s12,
  },
});
