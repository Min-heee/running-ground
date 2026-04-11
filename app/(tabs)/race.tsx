import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { InfoCard } from '@/components/ui/InfoCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { OfflineRaceEvent, OfflineRaceHub, OfflineRaceStatus } from '@/domain/types';
import { cancelOfflineRace, fetchOfflineRaceHub, joinOfflineRace } from '@/lib/api/services';

const fullDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatFullDate(value: string) {
  return fullDateFormatter.format(new Date(value));
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
      return '신청 마감';
    case 'live':
      return '진행 중';
    case 'finished':
      return '종료';
    default:
      return '';
  }
}

function getStatusTone(status: OfflineRaceStatus) {
  switch (status) {
    case 'registration_open':
      return styles.openBadge;
    case 'registration_closing':
      return styles.closingBadge;
    case 'registration_closed':
      return styles.closedBadge;
    case 'live':
      return styles.liveBadge;
    case 'finished':
      return styles.finishedBadge;
    default:
      return styles.openBadge;
  }
}

function getHeroMessage(event: OfflineRaceEvent, nowTime: number) {
  if (event.status === 'registration_open' || event.status === 'registration_closing') {
    return `신청 마감까지 ${formatCountdown(new Date(event.registrationClosesAt).getTime(), nowTime)} 남았어.`;
  }

  if (event.status === 'registration_closed') {
    return `신청은 닫혔고 ${formatShortTime(event.startsAt)}에 맞춰 각자 러닝을 시작하면 돼.`;
  }

  if (event.status === 'live') {
    return '지금 같은 시각에 각자 출발한 레이스가 진행 중이야. 기록이 실시간으로 집계되고 있어.';
  }

  return '이번 회차는 종료됐고, 다음 일정이 바로 아래에서 이어져.';
}

function getPrimaryActionLabel(event: OfflineRaceEvent) {
  if (event.registered && (event.status === 'registration_open' || event.status === 'registration_closing')) {
    return '신청 완료';
  }

  if (event.status === 'registration_open' || event.status === 'registration_closing') {
    return '참가 신청하기';
  }

  if (event.status === 'registration_closed') {
    return '신청 마감';
  }

  if (event.status === 'live') {
    return '현장 진행 중';
  }

  return '종료된 레이스';
}

export default function RaceScreen() {
  const { scrollToTop } = useLocalSearchParams<{ scrollToTop?: string }>();
  const [hub, setHub] = useState<OfflineRaceHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nowTime, setNowTime] = useState(Date.now());

  const loadHub = () => {
    setLoading(true);
    setError(null);

    fetchOfflineRaceHub()
      .then((data) => setHub(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '오프라인 마라톤 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const featuredEvent = hub?.featuredEvent ?? null;
  const canJoin = Boolean(
    featuredEvent
    && !featuredEvent.registered
    && ['registration_open', 'registration_closing'].includes(featuredEvent.status),
  );
  const canCancel = Boolean(
    featuredEvent
    && featuredEvent.registered
    && ['registration_open', 'registration_closing'].includes(featuredEvent.status),
  );
  const participantFill = featuredEvent ? Math.min(100, (featuredEvent.participantCount / featuredEvent.capacity) * 100) : 0;

  const handleJoin = async () => {
    if (!featuredEvent) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = await joinOfflineRace(featuredEvent.id);
      setHub((currentHub) => (currentHub ? { ...currentHub, featuredEvent: result.event } : currentHub));
      setActionMessage(`${result.event.title} 신청이 완료됐어. ${formatShortTime(result.event.startsAt)}에 맞춰 각자 뛰면 자동 집계돼.`);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : '레이스 신청에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!featuredEvent) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = await cancelOfflineRace(featuredEvent.id);
      setHub((currentHub) => (currentHub ? { ...currentHub, featuredEvent: result.event } : currentHub));
      setActionMessage('참가 신청을 취소했어. 다른 회차가 열리면 다시 바로 신청할 수 있어.');
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : '레이스 신청 취소에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scrollToTopKey={scrollToTop}>
      <PageHeader
        title="레이스"
        subtitle="정해진 시작 시각에 각자 뛰고 같은 회차로 집계되는 실시간 오프라인 마라톤 허브."
      />

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

      {featuredEvent ? (
        <>
          <Card style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={[styles.statusBadge, getStatusTone(featuredEvent.status)]}>
                <Text style={styles.statusBadgeText}>{getStatusLabel(featuredEvent.status)}</Text>
              </View>
              <Text style={styles.heroMeta}>정원 {featuredEvent.capacity}명</Text>
            </View>

            <Text style={styles.heroTitle}>{featuredEvent.title}</Text>
            <Text style={styles.heroSubtitle}>{featuredEvent.subtitle}</Text>
            <Text style={styles.heroMessage}>{getHeroMessage(featuredEvent, nowTime)}</Text>

            <View style={styles.heroMetricGrid}>
              <MetricBox label="출발 시각" value={formatFullDate(featuredEvent.startsAt)} />
              <MetricBox label="신청 마감" value={formatFullDate(featuredEvent.registrationClosesAt)} />
              <MetricBox label="참여 방식" value={featuredEvent.participationMode} />
              <MetricBox label="인증 방식" value={featuredEvent.proofMethod} />
              <MetricBox label="참가 포인트" value={`${featuredEvent.entryFeePoints}P`} />
            </View>

            <View style={styles.capacityCard}>
              <View style={styles.capacityRow}>
                <Text style={styles.capacityTitle}>현재 참가 현황</Text>
                <Text style={styles.capacityValue}>
                  {featuredEvent.participantCount} / {featuredEvent.capacity}명
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${participantFill}%` }]} />
              </View>
              <Text style={styles.capacityNote}>
                {featuredEvent.hostLabel} · 시작 후 {featuredEvent.runWindowMinutes}분 안에 기록 시작 인정
              </Text>
            </View>

            <View style={styles.actionWrap}>
              <Pressable
                style={[styles.primaryActionButton, !canJoin && styles.disabledActionButton]}
                disabled={!canJoin || submitting}
                onPress={handleJoin}
              >
                <Text style={styles.primaryActionText}>
                  {submitting && canJoin ? '신청 중...' : getPrimaryActionLabel(featuredEvent)}
                </Text>
              </Pressable>

              {canCancel ? (
                <Pressable
                  style={[styles.secondaryActionButton, submitting && styles.disabledActionButton]}
                  disabled={submitting}
                  onPress={handleCancel}
                >
                  <Text style={styles.secondaryActionText}>{submitting ? '처리 중...' : '신청 취소'}</Text>
                </Pressable>
              ) : null}
            </View>

            {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          </Card>

          <InfoCard title="운영 규칙">
            집결 장소는 따로 없고, 시작 1시간 전까지 신청한 뒤 정해진 시각에 각자 뛰는 구조야. 러닝 앱 연동 기록이나 수동 인증으로 완주를 확인하고 같은 회차로 묶어 집계해.
          </InfoCard>

          <Card>
            <Text style={styles.sectionTitle}>참가자 미리보기</Text>
            {featuredEvent.participantPreview.map((participant, index) => (
              <View key={participant.id} style={styles.participantRow}>
                <Text style={styles.participantRank}>{index + 1}</Text>
                <View style={styles.participantMeta}>
                  <Text style={styles.participantName}>{participant.name}</Text>
                  <Text style={styles.participantSub}>{participant.regionLabel}</Text>
                </View>
                <Text style={styles.participantPace}>{participant.paceGoal}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>진행 방식</Text>
            {hub?.guideSteps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepIndex}>
                  <Text style={styles.stepIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>다음 회차 미리보기</Text>
            {hub?.upcomingEvents.map((event) => (
              <View key={event.id} style={styles.scheduleRow}>
                <View style={styles.scheduleMeta}>
                  <Text style={styles.scheduleTitle}>{event.title}</Text>
                  <Text style={styles.scheduleSub}>
                    {formatFullDate(event.startsAt)} · {event.participationMode}
                  </Text>
                </View>
                <View style={styles.scheduleBadge}>
                  <Text style={styles.scheduleBadgeText}>{event.distanceKm}K</Text>
                </View>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>지난 레이스</Text>
            {hub?.pastEvents.map((event) => (
              <View key={event.id} style={styles.pastRow}>
                <View style={styles.pastMeta}>
                  <Text style={styles.pastTitle}>{event.title}</Text>
                  <Text style={styles.pastSub}>
                    {formatFullDate(event.finishedAt)} · {event.modeLabel} · 우승 {event.winnerName} · 완주 {event.finishers}명
                  </Text>
                  <Text style={styles.pastSummary}>{event.summary}</Text>
                </View>
                <Text style={styles.pastDistance}>{event.distanceKm}K</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#0F172A',
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openBadge: {
    backgroundColor: '#D1FADF',
  },
  closingBadge: {
    backgroundColor: '#FEF3C7',
  },
  closedBadge: {
    backgroundColor: '#E5E7EB',
  },
  liveBadge: {
    backgroundColor: '#FECACA',
  },
  finishedBadge: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  heroMeta: {
    color: '#CBD5E1',
    fontWeight: '700',
    includeFontPadding: false,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    includeFontPadding: false,
  },
  heroSubtitle: {
    color: '#D0D5DD',
    lineHeight: 20,
  },
  heroMessage: {
    color: '#C7D2FE',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  heroMetricGrid: {
    gap: 10,
  },
  metricBox: {
    backgroundColor: '#111C34',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  capacityCard: {
    backgroundColor: '#111C34',
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capacityTitle: {
    color: '#E2E8F0',
    fontWeight: '700',
    includeFontPadding: false,
  },
  capacityValue: {
    color: '#FFFFFF',
    fontWeight: '800',
    includeFontPadding: false,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#24324C',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#6D5EF7',
  },
  capacityNote: {
    color: '#94A3B8',
    lineHeight: 19,
  },
  actionWrap: {
    gap: 10,
  },
  primaryActionButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryActionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryActionText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
  disabledActionButton: {
    opacity: 0.45,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  participantRank: {
    width: 22,
    color: '#6B7280',
    fontWeight: '800',
    includeFontPadding: false,
  },
  participantMeta: {
    flex: 1,
    gap: 2,
  },
  participantName: {
    color: '#111827',
    fontWeight: '800',
    includeFontPadding: false,
  },
  participantSub: {
    color: '#667085',
    fontSize: 12,
    includeFontPadding: false,
  },
  participantPace: {
    color: '#111827',
    fontWeight: '800',
    includeFontPadding: false,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    color: '#4338CA',
    fontWeight: '800',
    includeFontPadding: false,
  },
  stepText: {
    flex: 1,
    color: '#475467',
    lineHeight: 21,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  scheduleMeta: {
    flex: 1,
    gap: 4,
  },
  scheduleTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  scheduleSub: {
    color: '#667085',
    lineHeight: 20,
  },
  scheduleBadge: {
    backgroundColor: '#F2F4F7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scheduleBadgeText: {
    color: '#344054',
    fontWeight: '800',
    includeFontPadding: false,
  },
  pastRow: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  pastMeta: {
    gap: 4,
  },
  pastTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  pastSub: {
    color: '#667085',
    lineHeight: 20,
  },
  pastSummary: {
    color: '#475467',
    lineHeight: 20,
  },
  pastDistance: {
    alignSelf: 'flex-start',
    color: '#6D5EF7',
    fontWeight: '800',
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  reloadButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reloadButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  successText: {
    color: '#B2F5EA',
    lineHeight: 20,
    fontWeight: '700',
  },
  errorText: {
    color: '#FECACA',
    lineHeight: 20,
    fontWeight: '700',
  },
});
