import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchRunDetail } from '@/lib/api/services';
import { RunDetailResponse } from '@/lib/api/types';
import { getRunSourceLabel } from '@/features/runs/sourceLabel';
import { formatDuration, getRunMapRegion } from '@/features/runs/tracking';
import { RunRouteMap } from '@/features/runs/RunRouteMap';

export default function RunDetailScreen() {
  const { runId, friendId, origin } = useLocalSearchParams<{ runId?: string; friendId?: string; origin?: string }>();
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '기록 상세 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  const backHref: Href = friendId
    ? { pathname: '/friend-detail', params: { friendId } }
    : origin === 'running'
      ? '/(tabs)/running'
      : '/my-activity';
  const backLabel = friendId
    ? '친구 활동으로 돌아가기'
    : origin === 'running'
      ? '런닝으로 돌아가기'
      : '내 활동으로 돌아가기';
  const sourceLabel = runDetail ? getRunSourceLabel(runDetail.run) : '';
  const routeCoordinates = runDetail?.run.route?.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  })) ?? [];
  const mapRegion = runDetail?.run.route ? getRunMapRegion(runDetail.run.route) : null;

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader title="기록 상세" subtitle={`${runDetail.run.date}에 뛴 러닝 기록 상세 정보.`} showBack backHref={backHref} />

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>기록 요약</Text>
            <Text style={styles.heroTitle}>{runDetail.run.distanceKm}km</Text>
            <Text style={styles.heroSub}>페이스 {runDetail.run.pace} · {sourceLabel}</Text>
          </Card>

          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>예상 소요 시간</Text>
              <Text style={styles.summaryValue}>
                {typeof runDetail.run.durationSeconds === 'number'
                  ? formatDuration(runDetail.run.durationSeconds)
                  : `${runDetail.estimatedMinutes}분`}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>획득 포인트</Text>
              <Text style={styles.summaryValue}>{runDetail.earnedPoint}P</Text>
            </Card>
          </View>

          <Card style={styles.pointBreakdownCard}>
            <View style={styles.pointBreakdownHeader}>
              <Text style={styles.sectionTitle}>포인트 내역</Text>
              {runDetail.pointBreakdown.matchBonusPoints > 0 ? (
                <View style={styles.matchBonusPill}>
                  <Text style={styles.matchBonusPillText}>매치 보너스 +{runDetail.pointBreakdown.matchBonusPoints}P</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.pointBreakdownRow}>
              <Text style={styles.pointBreakdownLabel}>레벨 보너스</Text>
              <Text style={styles.pointBreakdownValue}>+{runDetail.pointBreakdown.levelPoints}P</Text>
            </View>
            <View style={styles.pointBreakdownRow}>
              <Text style={styles.pointBreakdownLabel}>연속 러닝 보너스</Text>
              <Text style={styles.pointBreakdownValue}>+{runDetail.pointBreakdown.streakPoints}P</Text>
            </View>
            <View style={styles.pointBreakdownRow}>
              <Text style={styles.pointBreakdownLabel}>성장 보너스</Text>
              <Text style={styles.pointBreakdownValue}>+{runDetail.pointBreakdown.growthPoints}P</Text>
            </View>
            <View style={styles.pointBreakdownRow}>
              <Text style={styles.pointBreakdownLabel}>매치 보너스</Text>
              <Text
                style={[
                  styles.pointBreakdownValue,
                  runDetail.pointBreakdown.matchBonusPoints > 0 ? styles.pointBreakdownValueHighlight : null,
                ]}
              >
                +{runDetail.pointBreakdown.matchBonusPoints}P
              </Text>
            </View>
            <View style={styles.pointBreakdownTotalRow}>
              <Text style={styles.pointBreakdownTotalLabel}>총 획득 포인트</Text>
              <Text style={styles.pointBreakdownTotalValue}>+{runDetail.pointBreakdown.totalPoints}P</Text>
            </View>
          </Card>

          {runDetail.run.matchResult ? (
            <Card style={styles.matchResultCard}>
              <View style={styles.matchResultHeader}>
                <View>
                  <Text style={styles.matchResultLabel}>
                    {runDetail.run.matchResult.mode === 'duel' ? '1대1 매치 결과' : '그룹 매치 결과'}
                  </Text>
                  <Text style={styles.matchResultTitle}>{runDetail.run.matchResult.title}</Text>
                </View>
                <View
                  style={[
                    styles.matchResultBadge,
                    runDetail.run.matchResult.resultTone === 'win'
                      ? styles.matchResultBadgeWin
                      : runDetail.run.matchResult.resultTone === 'lose'
                        ? styles.matchResultBadgeLose
                        : runDetail.run.matchResult.resultTone === 'draw'
                          ? styles.matchResultBadgeDraw
                          : null,
                  ]}
                >
                  <Text style={styles.matchResultBadgeText}>{runDetail.run.matchResult.badgeLabel}</Text>
                </View>
              </View>
              <Text style={styles.matchResultSummary}>{runDetail.run.matchResult.summary}</Text>
              <View style={styles.matchResultMetaRow}>
                {runDetail.run.matchResult.opponentName ? (
                  <Text style={styles.matchResultMeta}>상대 {runDetail.run.matchResult.opponentName}</Text>
                ) : null}
                {typeof runDetail.run.matchResult.rank === 'number' && typeof runDetail.run.matchResult.participantCount === 'number' ? (
                  <Text style={styles.matchResultMeta}>
                    {runDetail.run.matchResult.participantCount}명 중 {runDetail.run.matchResult.rank}위
                  </Text>
                ) : null}
                {typeof runDetail.run.matchResult.gapKm === 'number' ? (
                  <Text style={styles.matchResultMeta}>
                    거리 차이 {runDetail.run.matchResult.gapKm.toFixed(2)}km
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          {mapRegion ? (
            <Card style={styles.mapCard}>
              <Text style={styles.sectionTitle}>러닝 경로</Text>
              <View style={styles.mapWrap}>
                <RunRouteMap
                  actualCoordinates={routeCoordinates}
                  latestCoordinate={routeCoordinates.length ? routeCoordinates[routeCoordinates.length - 1] : null}
                  initialRegion={mapRegion}
                  emptyTitle="저장된 러닝 경로를 불러오는 중이에요."
                  emptyText="이 기록에는 지도 경로가 함께 저장돼 있어요."
                />
              </View>
            </Card>
          ) : null}

          {runDetail.run.durationSeconds || runDetail.run.cadenceSpm || runDetail.run.elevationGainM ? (
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>케이던스</Text>
                <Text style={styles.summaryValueSmall}>
                  {runDetail.run.cadenceSpm ? `${runDetail.run.cadenceSpm}spm` : '--'}
                </Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>고도 상승</Text>
                <Text style={styles.summaryValueSmall}>
                  {typeof runDetail.run.elevationGainM === 'number' ? `${runDetail.run.elevationGainM}m` : '--'}
                </Text>
              </Card>
            </View>
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>상세 정보</Text>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>날짜</Text><Text style={styles.detailValue}>{runDetail.run.date}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>거리</Text><Text style={styles.detailValue}>{runDetail.run.distanceKm}km</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>페이스</Text><Text style={styles.detailValue}>{runDetail.run.pace}</Text></View>
            {typeof runDetail.run.durationSeconds === 'number' ? (
              <View style={styles.detailRow}><Text style={styles.detailLabel}>측정 시간</Text><Text style={styles.detailValue}>{formatDuration(runDetail.run.durationSeconds)}</Text></View>
            ) : null}
            {runDetail.run.startedAt ? (
              <View style={styles.detailRow}><Text style={styles.detailLabel}>시작 시각</Text><Text style={styles.detailValue}>{runDetail.run.startedAt.slice(11, 16)}</Text></View>
            ) : null}
            {runDetail.run.endedAt ? (
              <View style={styles.detailRow}><Text style={styles.detailLabel}>종료 시각</Text><Text style={styles.detailValue}>{runDetail.run.endedAt.slice(11, 16)}</Text></View>
            ) : null}
            <View style={styles.detailRow}><Text style={styles.detailLabel}>기록 소스</Text><Text style={styles.detailValue}>{sourceLabel}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>주간 누적 거리</Text><Text style={styles.detailValue}>{runDetail.weeklyDistanceKm}km</Text></View>
          </Card>

          <SecondaryButton
            label={backLabel}
            onPress={() => router.replace(backHref)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#111827',
    gap: 8,
  },
  heroLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  heroSub: {
    color: '#98A2B3',
    fontWeight: '700',
  },
  matchResultCard: {
    backgroundColor: '#F8F7FF',
    borderWidth: 1,
    borderColor: '#D9D6FE',
    gap: 10,
  },
  matchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchResultLabel: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '800',
  },
  matchResultTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  matchResultBadge: {
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#111827',
  },
  matchResultBadgeWin: {
    backgroundColor: '#0F9D58',
  },
  matchResultBadgeLose: {
    backgroundColor: '#F97316',
  },
  matchResultBadgeDraw: {
    backgroundColor: '#6B7280',
  },
  matchResultBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchResultSummary: {
    color: '#344054',
    fontWeight: '700',
    lineHeight: 20,
  },
  matchResultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchResultMeta: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
  },
  summaryValueSmall: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  summaryLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  summaryValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  pointBreakdownCard: {
    gap: 10,
  },
  pointBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  matchBonusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF4FF',
  },
  matchBonusPillText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
  },
  pointBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointBreakdownLabel: {
    color: '#475467',
    fontWeight: '700',
  },
  pointBreakdownValue: {
    color: '#111827',
    fontWeight: '800',
  },
  pointBreakdownValueHighlight: {
    color: '#1D4ED8',
  },
  pointBreakdownTotalRow: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D0D5DD',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointBreakdownTotalLabel: {
    color: '#111827',
    fontWeight: '800',
  },
  pointBreakdownTotalValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  mapCard: {
    gap: 12,
  },
  mapWrap: {
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  detailLabel: {
    color: '#667085',
    fontWeight: '700',
  },
  detailValue: {
    color: '#111827',
    fontWeight: '700',
  },
});
