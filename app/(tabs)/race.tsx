import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { PageHeader } from '@/components/ui/PageHeader';
import { OfflineRaceEvent, OfflineRaceHub, OfflineRaceStatus } from '@/domain/types';
import { cancelOfflineRace, fetchOfflineRaceHub, joinOfflineRace } from '@/lib/api/services';

const dateDayFormatter = new Intl.DateTimeFormat('ko-KR', {
  day: 'numeric',
});

const dateWeekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
  weekday: 'short',
});

const selectedDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function formatCountdown(targetTime: number, nowTime: number) {
  const diffMs = Math.max(0, targetTime - nowTime);
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}일 ${hours}시간`;
  }

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  return `${minutes}분`;
}

function getStatusLabel(status: OfflineRaceStatus) {
  switch (status) {
    case 'registration_open':
      return '신청 가능';
    case 'registration_closing':
      return '마감 임박';
    case 'registration_closed':
      return '마감';
    case 'live':
      return '진행 중';
    case 'finished':
      return '종료';
    default:
      return '';
  }
}

function canJoinEvent(event: OfflineRaceEvent) {
  return !event.registered && ['registration_open', 'registration_closing'].includes(event.status);
}

function canCancelEvent(event: OfflineRaceEvent) {
  return event.registered && ['registration_open', 'registration_closing'].includes(event.status);
}

function getEventNote(event: OfflineRaceEvent, nowTime: number) {
  if (event.status === 'registration_open' || event.status === 'registration_closing') {
    if (event.registered) {
      return `신청 완료 · ${formatShortTime(event.startsAt)}에 맞춰 각자 출발하면 돼요.`;
    }

    return `신청 마감 ${formatShortTime(event.registrationClosesAt)} · ${formatCountdown(new Date(event.registrationClosesAt).getTime(), nowTime)} 남았어요.`;
  }

  if (event.status === 'registration_closed') {
    return `${formatShortTime(event.startsAt)} 출발 예정 · 지금은 신청이 마감됐어요.`;
  }

  if (event.status === 'live') {
    return '지금 같은 회차가 진행 중이고 기록이 실시간으로 집계되고 있어요.';
  }

  return '종료된 회차예요.';
}

function replaceEventInHub(currentHub: OfflineRaceHub, event: OfflineRaceEvent): OfflineRaceHub {
  return {
    ...currentHub,
    featuredEvent: currentHub.featuredEvent?.id === event.id ? event : currentHub.featuredEvent,
    upcomingEvents: currentHub.upcomingEvents.map((item) => (item.id === event.id ? event : item)),
  };
}

export default function RaceScreen() {
  const { scrollToTop } = useLocalSearchParams<{ scrollToTop?: string }>();
  const [hub, setHub] = useState<OfflineRaceHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingEventId, setSubmittingEventId] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedOptionBySlot, setSelectedOptionBySlot] = useState<Record<string, string>>({});
  const [expandedSlotKey, setExpandedSlotKey] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState(Date.now());

  const loadHub = () => {
    setLoading(true);
    setError(null);

    fetchOfflineRaceHub()
      .then((data) => setHub(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '레이스 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const raceEvents = useMemo(() => {
    if (!hub) {
      return [];
    }

    return [hub.featuredEvent, ...hub.upcomingEvents]
      .filter((event): event is OfflineRaceEvent => Boolean(event))
      .filter((event) => event.status !== 'finished')
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [hub]);

  const dateOptions = useMemo(() => {
    const timeSlotsByDate = new Map<string, Set<string>>();

    raceEvents.forEach((event) => {
      const dateKey = formatDateKey(event.startsAt);
      const currentSet = timeSlotsByDate.get(dateKey) ?? new Set<string>();
      currentSet.add(event.startsAt);
      timeSlotsByDate.set(dateKey, currentSet);
    });

    return Array.from(timeSlotsByDate.entries())
      .map(([key, slots]) => ({
        key,
        count: slots.size,
        date: parseDateKey(key),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [raceEvents]);

  useEffect(() => {
    if (dateOptions.length === 0) {
      setSelectedDateKey(null);
      return;
    }

    if (!selectedDateKey || !dateOptions.some((option) => option.key === selectedDateKey)) {
      setSelectedDateKey(dateOptions[0].key);
    }
  }, [dateOptions, selectedDateKey]);

  const selectedSlots = useMemo(() => {
    const selectedEvents = raceEvents.filter((event) => formatDateKey(event.startsAt) === selectedDateKey);
    const slotMap = new Map<string, {
      startsAt: string;
      title: string;
      subtitle: string;
      hostLabel: string;
      participationMode: string;
      options: OfflineRaceEvent[];
    }>();

    selectedEvents.forEach((event) => {
      const existingSlot = slotMap.get(event.startsAt);

      if (existingSlot) {
        existingSlot.options.push(event);
        return;
      }

      slotMap.set(event.startsAt, {
        startsAt: event.startsAt,
        title: event.title,
        subtitle: event.subtitle,
        hostLabel: event.hostLabel,
        participationMode: event.participationMode,
        options: [event],
      });
    });

    return Array.from(slotMap.values())
      .map((slot) => ({
        ...slot,
        options: [...slot.options].sort((left, right) => left.distanceKm - right.distanceKm),
      }))
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [raceEvents, selectedDateKey]);

  useEffect(() => {
    setSelectedOptionBySlot((current) => {
      const next: Record<string, string> = {};

      selectedSlots.forEach((slot) => {
        const selectedId = current[slot.startsAt];
        const matched = slot.options.find((event) => event.id === selectedId);
        const defaultEvent = slot.options.find((event) => event.registered) ?? slot.options[0];

        if (matched) {
          next[slot.startsAt] = matched.id;
        } else if (defaultEvent) {
          next[slot.startsAt] = defaultEvent.id;
        }
      });

      return next;
    });

    setExpandedSlotKey((current) => (
      current && selectedSlots.some((slot) => slot.startsAt === current) ? current : null
    ));
  }, [selectedSlots]);

  const handleEventAction = async (event: OfflineRaceEvent) => {
    setSubmittingEventId(event.id);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = canCancelEvent(event) ? await cancelOfflineRace(event.id) : await joinOfflineRace(event.id);

      setHub((currentHub) => (currentHub ? replaceEventInHub(currentHub, result.event) : currentHub));
      setActionMessage(
        canCancelEvent(event)
          ? `${result.event.title} ${result.event.distanceKm}K 신청을 취소했어요.`
          : `${result.event.title} ${result.event.distanceKm}K 신청이 완료됐어요.`,
      );
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : '레이스 신청 처리에 실패했어.');
    } finally {
      setSubmittingEventId(null);
    }
  };

  return (
    <Screen scrollToTopKey={scrollToTop}>
      <PageHeader title="레이스" />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading && error ? (
        <Card>
          <Text style={styles.stateTitle}>레이스 정보를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.reloadButton} onPress={loadHub}>
            <Text style={styles.reloadButtonText}>다시 불러오기</Text>
          </Pressable>
        </Card>
      ) : null}

      {!loading && !error && hub ? (
        <>
          <Card style={styles.guideCard}>
            <Text style={styles.sectionTitle}>운영 방식</Text>
            <View style={styles.guideList}>
              {hub.guideSteps.map((step, index) => (
                <View key={step} style={styles.guideRow}>
                  <View style={styles.guideIndex}>
                    <Text style={styles.guideIndexText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.guideText}>{step}</Text>
                </View>
              ))}
            </View>
          </Card>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>날짜 선택</Text>
            <Text style={styles.sectionCount}>{dateOptions.length}일</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateChipRow}>
            {dateOptions.map((option) => {
              const active = option.key === selectedDateKey;

              return (
                <Pressable
                  key={option.key}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                  onPress={() => setSelectedDateKey(option.key)}
                >
                  <Text style={[styles.dateChipWeekday, active && styles.dateChipWeekdayActive]}>
                    {dateWeekdayFormatter.format(option.date)}
                  </Text>
                  <Text style={[styles.dateChipDay, active && styles.dateChipDayActive]}>
                    {dateDayFormatter.format(option.date)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedDateKey ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.scheduleDateTitle}>{selectedDateFormatter.format(parseDateKey(selectedDateKey))}</Text>
            </View>
          ) : null}

          {actionMessage ? (
            <View style={styles.feedbackSuccess}>
              <Text style={styles.feedbackSuccessText}>{actionMessage}</Text>
            </View>
          ) : null}
          {actionError ? (
            <View style={styles.feedbackError}>
              <Text style={styles.feedbackErrorText}>{actionError}</Text>
            </View>
          ) : null}

          {selectedSlots.length > 0 ? (
            selectedSlots.map((slot) => (
              <Card key={slot.startsAt} style={styles.slotCard}>
                {(() => {
                  const selectedEvent =
                    slot.options.find((event) => event.id === selectedOptionBySlot[slot.startsAt]) ?? slot.options[0];
                  const isExpanded = expandedSlotKey === slot.startsAt;
                  const isSubmitting = submittingEventId === selectedEvent.id;
                  const canJoin = canJoinEvent(selectedEvent);
                  const canCancel = canCancelEvent(selectedEvent);

                  return (
                    <>
                      <View style={styles.slotHeader}>
                        <View style={styles.timeColumn}>
                          <Text style={styles.timeValue}>{formatShortTime(slot.startsAt)}</Text>
                          <Text style={styles.timeLabel}>시작</Text>
                        </View>

                        <View style={styles.slotBody}>
                          <View style={styles.slotTitleRow}>
                            <Text style={styles.slotTitle}>{slot.title}</Text>
                            <Pressable
                              style={[styles.distanceSelectButton, isExpanded && styles.distanceSelectButtonActive]}
                              onPress={() => setExpandedSlotKey((current) => (current === slot.startsAt ? null : slot.startsAt))}
                            >
                              <Text style={styles.distanceSelectText}>{selectedEvent.distanceKm}K</Text>
                              <View style={[styles.distanceSelectIconWrap, isExpanded && styles.distanceSelectIconWrapActive]}>
                                <Feather
                                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={14}
                                  color={isExpanded ? '#111827' : '#667085'}
                                />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      </View>

                      {isExpanded ? (
                        <View style={styles.distanceOptionRow}>
                          {slot.options.map((event) => {
                            const active = event.id === selectedEvent.id;

                            return (
                              <Pressable
                                key={event.id}
                                style={[styles.distanceOptionChip, active && styles.distanceOptionChipActive]}
                                onPress={() => {
                                  setSelectedOptionBySlot((current) => ({
                                    ...current,
                                    [slot.startsAt]: event.id,
                                  }));
                                  setExpandedSlotKey(null);
                                }}
                              >
                                <Text style={[styles.distanceOptionChipText, active && styles.distanceOptionChipTextActive]}>
                                  {event.distanceKm}K
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      <View style={styles.optionInlineRow}>
                        <View style={styles.optionMetaWrap}>
                          <View style={styles.inlinePill}>
                            <Text style={styles.inlinePillLabel}>{selectedEvent.distanceKm}K</Text>
                          </View>
                          <View style={styles.inlinePill}>
                            <Text style={styles.inlinePillText}>{selectedEvent.participantCount}/{selectedEvent.capacity}</Text>
                          </View>
                          <View style={styles.inlinePill}>
                            <Text style={styles.inlinePillText}>{selectedEvent.entryFeePoints}P</Text>
                          </View>
                          <View style={[styles.statusBadge, styles[`${selectedEvent.status}Tone` as keyof typeof styles] as object]}>
                            <Text style={styles.statusBadgeText}>{getStatusLabel(selectedEvent.status)}</Text>
                          </View>
                        </View>

                        <Pressable
                          style={[
                            styles.actionButton,
                            canCancel ? styles.cancelActionButton : canJoin ? styles.joinActionButton : styles.disabledActionButton,
                          ]}
                          onPress={() => handleEventAction(selectedEvent)}
                          disabled={(!canJoin && !canCancel) || isSubmitting}
                        >
                          <Text
                            style={[
                              styles.actionButtonText,
                              canCancel ? styles.cancelActionButtonText : canJoin ? styles.joinActionButtonText : styles.disabledActionButtonText,
                            ]}
                          >
                            {isSubmitting
                              ? canCancel
                                ? '취소 중'
                                : '신청 중'
                              : canCancel
                                ? '취소'
                                : canJoin
                                  ? '신청'
                                  : selectedEvent.status === 'registration_closed'
                                    ? '마감'
                                    : selectedEvent.status === 'live'
                                      ? '진행'
                                      : '종료'}
                          </Text>
                        </Pressable>
                      </View>

                      <Text numberOfLines={1} style={styles.optionNote}>{getEventNote(selectedEvent, nowTime)}</Text>
                    </>
                  );
                })()}
              </Card>
            ))
          ) : (
            <Card>
              <Text style={styles.emptyTitle}>이 날짜에는 열리는 레이스가 아직 없어.</Text>
              <Text style={styles.emptyText}>다른 날짜를 누르면 바로 시간대별 일정이 보여요.</Text>
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  dateChipRow: {
    gap: 10,
    paddingRight: 16,
  },
  dateChip: {
    width: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  dateChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  dateChipDay: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    includeFontPadding: false,
  },
  dateChipDayActive: {
    color: '#FFFFFF',
  },
  dateChipWeekday: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  dateChipWeekdayActive: {
    color: '#D0D5DD',
  },
  guideCard: {
    gap: 14,
  },
  guideList: {
    gap: 12,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideIndex: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  guideIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  guideText: {
    flex: 1,
    color: '#475467',
    lineHeight: 20,
  },
  scheduleDateTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF3',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackSuccessText: {
    color: '#067647',
    fontWeight: '700',
    lineHeight: 20,
  },
  feedbackError: {
    backgroundColor: '#FEF3F2',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackErrorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
  slotCard: {
    padding: 12,
    gap: 10,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeColumn: {
    width: 62,
    alignItems: 'flex-start',
  },
  timeValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    includeFontPadding: false,
  },
  timeLabel: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  slotBody: {
    flex: 1,
    gap: 2,
  },
  slotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  slotTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    includeFontPadding: false,
    flex: 1,
  },
  slotSubtitle: {
    color: '#475467',
    lineHeight: 20,
  },
  slotMeta: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  distanceSelectButton: {
    minWidth: 66,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  distanceSelectButtonActive: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  distanceSelectText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  distanceSelectIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceSelectIconWrapActive: {
    backgroundColor: '#E5E7EB',
  },
  distanceOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  distanceOptionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceOptionChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  distanceOptionChipText: {
    color: '#475467',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  distanceOptionChipTextActive: {
    color: '#FFFFFF',
  },
  optionInlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  optionMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  inlinePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlinePillLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  inlinePillText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  registration_openTone: {
    backgroundColor: '#D1FADF',
  },
  registration_closingTone: {
    backgroundColor: '#FEF3C7',
  },
  registration_closedTone: {
    backgroundColor: '#E5E7EB',
  },
  liveTone: {
    backgroundColor: '#FECACA',
  },
  finishedTone: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  optionNote: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 17,
  },
  actionButton: {
    minWidth: 60,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  joinActionButton: {
    backgroundColor: '#111827',
  },
  cancelActionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  disabledActionButton: {
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  joinActionButtonText: {
    color: '#FFFFFF',
  },
  cancelActionButtonText: {
    color: '#344054',
  },
  disabledActionButtonText: {
    color: '#98A2B3',
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
  reloadButton: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reloadButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
    marginTop: 6,
  },
});
