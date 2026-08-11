import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  resolveRaceJoinAction,
} from '@/features/race/raceHubModel';
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
  onJoin,
  onCancel,
}: {
  event: OfflineRaceEvent;
  busy: boolean;
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

      {action.kind === 'cancel' ? (
        <SecondaryButton label={busy ? '처리 중…' : action.label} onPress={() => onCancel(event)} disabled={busy} />
      ) : (
        <PrimaryButton
          label={busy ? '처리 중…' : action.label}
          onPress={() => onJoin(event)}
          disabled={busy || action.disabled}
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
      {event.registered ? <Text style={styles.upcomingRegistered}>신청 완료</Text> : null}
    </Pressable>
  );
}

export default function RaceScreen() {
  useTabWarmupTrace('race');
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const handleJoin = useCallback(async (event: OfflineRaceEvent) => {
    setBusyEventId(event.id);
    setActionError(null);
    try {
      await joinOfflineRace(event.id);
      // 출발 10분 전 로컬 알림 — 화면이 꺼져 있어도 OS가 배달한다. 실패(권한 거부 등)해도
      // 신청 자체는 성공이므로 막지 않는다.
      void scheduleRaceReminder({ eventId: event.id, title: event.title, startsAt: event.startsAt });
      await loadHub();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '레이스 신청에 실패했어요.');
    } finally {
      setBusyEventId(null);
    }
  }, [loadHub]);

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

      {state.status === 'ready' ? (
        <>
          {actionError ? (
            <Card style={styles.actionErrorCard}>
              <Text style={styles.actionErrorText}>{actionError}</Text>
            </Card>
          ) : null}

          {state.hub.featuredEvent ? (
            <FeaturedEventCard
              event={state.hub.featuredEvent}
              busy={busyEventId === state.hub.featuredEvent.id}
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

          {state.hub.upcomingEvents.length ? (
            <View style={styles.section}>
              <SectionTitle>다가오는 레이스</SectionTitle>
              <Card style={styles.upcomingCard}>
                {state.hub.upcomingEvents.map((event) => (
                  <UpcomingEventRow key={event.id} event={event} />
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
      ) : null}
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
