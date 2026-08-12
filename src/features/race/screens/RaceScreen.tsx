import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/SectionTitle';
import { TabHeader } from '@/components/ui/TabHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { StateMessageCard } from '@/components/ui/StateMessageCard';
import type { OfflineRaceEvent, OfflineRaceHub } from '@/domain/match';
import {
  buildRaceDdayLabel,
  formatRaceStartLabel,
  resolveRaceArenaHandoffTarget,
  resolveRaceJoinAction,
  shouldRefetchForRaceFormation,
} from '@/features/race/raceHubModel';
import { useReservationArenaHandoff } from '@/features/match/hooks/useReservationArenaHandoff';
import { isGlobalTrackerBusy } from '@/features/runs/tracking/globalTrackerActivity';
import {
  cancelRaceReminder,
  scheduleRaceReminder,
} from '@/features/race/raceReminderNotification';
import {
  cancelOfflineRace,
  fetchOfflineRaceHub,
  joinOfflineRace,
} from '@/lib/api/services/races';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HubState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; hub: OfflineRaceHub };

function formatDistanceLabel(distanceKm: number): string {
  return Number.isInteger(distanceKm) ? `${distanceKm}km` : `${distanceKm.toFixed(2)}km`;
}

function EventMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function FeaturedEventCard({
  event,
  busy,
  password,
  onChangePassword,
  onJoin,
  onCancel,
}: {
  event: OfflineRaceEvent;
  busy: boolean;
  password: string;
  onChangePassword: (value: string) => void;
  onJoin: (event: OfflineRaceEvent) => void;
  onCancel: (event: OfflineRaceEvent) => void;
}) {
  const dday = buildRaceDdayLabel(event.startsAt, Date.now());
  const action = resolveRaceJoinAction(event);
  const capacityLabel = event.capacity > 0
    ? `${event.participantCount}명 / ${event.capacity}명`
    : `${event.participantCount}명 참가 중`;

  return (
    <Card style={styles.featuredCard}>
      <View style={styles.featuredTopRow}>
        {dday ? (
          <View style={styles.ddayPill}>
            <Text style={styles.ddayText}>{dday}</Text>
          </View>
        ) : null}
        {event.registered ? (
          <View style={styles.registeredPill}>
            <Text style={styles.registeredText}>신청 완료</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.featuredTitle}>{event.title}</Text>
      {event.subtitle ? <Text style={styles.featuredSubtitle}>{event.subtitle}</Text> : null}

      <View style={styles.metaBlock}>
        <EventMetaRow label="일시" value={formatRaceStartLabel(event.startsAt)} />
        <EventMetaRow label="거리" value={formatDistanceLabel(event.distanceKm)} />
        <EventMetaRow label="참가" value={capacityLabel} />
        <EventMetaRow label="방식" value="전원 동시 출발 · 라이브 순위" />
      </View>

      {event.operationNote ? (
        <View style={styles.rewardBox}>
          <Text style={styles.rewardEyebrow}>완주 보상</Text>
          <Text style={styles.rewardText}>{event.operationNote}</Text>
        </View>
      ) : null}

      {action.kind === 'join' && event.passwordRequired ? (
        <TextInput
          style={styles.passwordInput}
          value={password}
          onChangeText={onChangePassword}
          placeholder="참가 비밀번호"
          placeholderTextColor={colors.textPlaceholder}
          keyboardType="number-pad"
          secureTextEntry
          editable={!busy}
        />
      ) : null}

      {action.kind === 'cancel' ? (
        <SecondaryButton label={busy ? '처리 중…' : action.label} onPress={() => onCancel(event)} disabled={busy} />
      ) : (
        <PrimaryButton
          label={busy ? '처리 중…' : action.label}
          onPress={() => onJoin(event)}
          disabled={busy || action.disabled || (Boolean(event.passwordRequired) && !password.trim())}
        />
      )}
    </Card>
  );
}

function UpcomingEventRow({ event, onPress }: { event: OfflineRaceEvent; onPress?: () => void }) {
  return (
    <Pressable style={styles.upcomingRow} onPress={onPress}>
      <View style={styles.upcomingCopy}>
        <Text style={styles.upcomingTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.upcomingMeta}>
          {formatRaceStartLabel(event.startsAt)} · {formatDistanceLabel(event.distanceKm)}
        </Text>
      </View>
      {event.registered
        ? <Text style={styles.upcomingRegistered}>신청 완료</Text>
        : <Text style={styles.upcomingChevron}>›</Text>}
    </Pressable>
  );
}

export default function RaceScreen() {
  useTabWarmupTrace('race');
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  // 대표 카드는 서버 추천(내가 신청한 것 우선)이 기본이지만, 목록의 다른 이벤트를 탭하면 그
  // 이벤트가 대표 자리로 올라와 신청/취소/비밀번호 입력이 가능해진다 — 이벤트가 여러 개일 때
  // 목록 줄에는 신청 수단이 없다는 구멍(광복절 런 테스트 신청 불가)의 수정.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 1초 시계 — 아레나 자동 핸드오프 창(≤25s) 판정용. freezeOnBlur 아래에서는 이 탭이 포커스된
  // 동안(또는 창 안에서 복귀한 순간)에만 렌더가 흐른다 — 홈 카드와 같은 발동 규칙.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 815 리허설 (2026-08-11): 레이스 탭에서 카운트다운을 보며 기다려도 정각에 아레나로 넘어가지
  // 않았다. 신청+편성된 이벤트가 출발 25초 안이면 예약 방/홈과 같은 핸드오프로 러닝 탭에 교체
  // 진입한다. 기록 중(워밍업 솔로런)이면 자동 진입 포기 — 런타임 isIdle 게이트와 같은 계약.
  const handoffTarget = useMemo(
    () => (state.status === 'ready'
      ? resolveRaceArenaHandoffTarget(
        [state.hub.featuredEvent, ...state.hub.upcomingEvents].filter(
          (event): event is OfflineRaceEvent => event !== null,
        ),
        nowMs,
      )
      : null),
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

  const loadHub = useCallback(async () => {
    try {
      const hub = await fetchOfflineRaceHub();
      setState({ status: 'ready', hub });
    } catch {
      setState((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHub();
    }, [loadHub]),
  );

  // 마감 전부터 탭을 켜두고 기다리면 편성(formedMatchId)을 모른 채 핸드오프 창을 지나친다 —
  // 신청한 이벤트가 미편성인데 출발이 임박하면 20초 스로틀로 허브를 재조회한다. 허브 GET이
  // 서버 편성 스윕을 겸하므로 혼자 기다리는 클라이언트도 편성을 스스로 촉발한다.
  const lastFormationRefetchMsRef = useRef(0);
  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const events = [state.hub.featuredEvent, ...state.hub.upcomingEvents]
      .filter((event): event is OfflineRaceEvent => event !== null);

    if (!shouldRefetchForRaceFormation(events, nowMs)) {
      return;
    }

    if (nowMs - lastFormationRefetchMsRef.current < 20_000) {
      return;
    }

    lastFormationRefetchMsRef.current = nowMs;
    void loadHub();
  }, [loadHub, nowMs, state]);

  const handleJoin = useCallback(async (event: OfflineRaceEvent) => {
    setBusyEventId(event.id);
    setActionError(null);
    try {
      await joinOfflineRace(event.id, event.passwordRequired ? joinPassword.trim() : undefined);
      setJoinPassword('');
      // 출발 10분 전 로컬 알림 — 화면이 꺼져 있어도 OS가 배달한다. 실패(권한 거부 등)해도
      // 신청 자체는 성공이므로 막지 않는다.
      void scheduleRaceReminder({ eventId: event.id, title: event.title, startsAt: event.startsAt });
      await loadHub();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '레이스 신청에 실패했어요.');
    } finally {
      setBusyEventId(null);
    }
  }, [joinPassword, loadHub]);

  const handleCancel = useCallback(async (event: OfflineRaceEvent) => {
    setBusyEventId(event.id);
    setActionError(null);
    try {
      await cancelOfflineRace(event.id);
      void cancelRaceReminder(event.id);
      await loadHub();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '레이스 신청 취소에 실패했어요.');
    } finally {
      setBusyEventId(null);
    }
  }, [loadHub]);

  return (
    <Screen>
      <TabHeader title="레이스" />

      {state.status === 'loading' ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>레이스 정보를 불러오고 있어요</Text>
        </Card>
      ) : null}

      {state.status === 'error' ? (
        <StateMessageCard
          title="불러오지 못했어요"
          message="레이스 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요."
          actionLabel="다시 시도"
          onAction={() => {
            setState({ status: 'loading' });
            void loadHub();
          }}
        />
      ) : null}

      {state.status === 'ready' ? (() => {
        const allEvents = [state.hub.featuredEvent, ...state.hub.upcomingEvents]
          .filter((event): event is OfflineRaceEvent => Boolean(event));
        const displayedEvent = allEvents.find((event) => event.id === selectedEventId)
          ?? state.hub.featuredEvent;
        const otherEvents = allEvents.filter((event) => event.id !== displayedEvent?.id);

        return (
        <>
          {actionError ? (
            <Card style={styles.actionErrorCard}>
              <Text style={styles.actionErrorText}>{actionError}</Text>
            </Card>
          ) : null}

          {displayedEvent ? (
            <FeaturedEventCard
              event={displayedEvent}
              busy={busyEventId === displayedEvent.id}
              password={joinPassword}
              onChangePassword={setJoinPassword}
              onJoin={handleJoin}
              onCancel={handleCancel}
            />
          ) : (
            <Card>
              <Text style={styles.emptyTitle}>예정된 레이스가 없어요</Text>
              <Text style={styles.emptyDescription}>
                다음 레이스가 열리면 여기에 먼저 보여드릴게요.
              </Text>
            </Card>
          )}

          {otherEvents.length ? (
            <View style={styles.section}>
              <SectionTitle>다가오는 레이스</SectionTitle>
              <Card style={styles.upcomingCard}>
                {otherEvents.map((event) => (
                  <UpcomingEventRow
                    key={event.id}
                    event={event}
                    onPress={() => {
                      setSelectedEventId(event.id);
                      setJoinPassword('');
                      setActionError(null);
                    }}
                  />
                ))}
              </Card>
            </View>
          ) : null}

          {state.hub.pastEvents.length ? (
            <View style={styles.section}>
              <SectionTitle>지난 레이스</SectionTitle>
              <Card style={styles.upcomingCard}>
                {state.hub.pastEvents.map((past) => (
                  <View key={past.id} style={styles.upcomingRow}>
                    <View style={styles.upcomingCopy}>
                      <Text style={styles.upcomingTitle} numberOfLines={1}>{past.title}</Text>
                      <Text style={styles.upcomingMeta}>
                        {past.modeLabel} · 완주 {past.finishers}명
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </>
        );
      })() : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    alignItems: 'center',
    gap: spacing.s10,
    paddingVertical: spacing.s24,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  actionErrorCard: {
    borderColor: colors.dangerBorder,
    marginBottom: spacing.s12,
  },
  actionErrorText: {
    color: colors.danger,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  featuredCard: {
    gap: spacing.s12,
  },
  featuredTopRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  ddayPill: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
  },
  ddayText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  registeredPill: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
  },
  registeredText: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  featuredTitle: {
    color: colors.textHeading,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
  },
  featuredSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 21,
  },
  metaBlock: {
    gap: spacing.s10,
  },
  passwordInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  rewardBox: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brandSoftBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.s14,
  },
  rewardEyebrow: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
  },
  rewardText: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  section: {
    gap: spacing.s12,
  },
  upcomingCard: {
    gap: spacing.s12,
  },
  upcomingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  upcomingCopy: {
    flex: 1,
    gap: spacing.xs,
    marginRight: spacing.s10,
  },
  upcomingTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  upcomingMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  upcomingChevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  upcomingRegistered: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  emptyTitle: {
    color: colors.textHeading,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.s10,
  },
  emptyDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 22,
  },
});
