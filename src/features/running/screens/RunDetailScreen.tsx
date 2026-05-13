import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RunDetailInfoCard } from '@/features/running/components/RunDetailInfoCard';
import { RunMatchResultCard } from '@/features/running/components/RunMatchResultCard';
import { RunPointBreakdownCard } from '@/features/running/components/RunPointBreakdownCard';
import { RunExtraMetricsRow, RunHeroCard, RunSummaryMetricRow } from '@/features/running/components/RunSummaryCards';
import { fetchRunDetail } from '@/services';
import { RunDetailResponse } from '@/lib/api/types';
import { getRunSourceLabel } from '@/features/runs/sourceLabel';
import { getRunMapRegion } from '@/features/runs/tracking';
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
  const matchResult = runDetail?.run.matchResult ?? null;
  const matchBonusLabel = matchResult
    ? matchResult.mode === 'duel'
      ? '1대1 대결 포인트'
      : '그룹 대결 포인트'
    : '매치 보너스';
  const routeCoordinates = useMemo(() => (
    runDetail?.run.route?.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })) ?? []
  ), [runDetail?.run.route]);
  const latestCoordinate = routeCoordinates.length ? routeCoordinates[routeCoordinates.length - 1] : null;
  const mapRegion = useMemo(
    () => (runDetail?.run.route ? getRunMapRegion(runDetail.run.route) : null),
    [runDetail?.run.route],
  );

  return (
    <Screen>
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}

      {runDetail ? (
        <>
          <AuthHeader title="기록 상세" subtitle={`${runDetail.run.date}에 뛴 러닝 기록 상세 정보.`} showBack backHref={backHref} />

          <RunHeroCard distanceKm={runDetail.run.distanceKm} pace={runDetail.run.pace} sourceLabel={sourceLabel} />

          <RunSummaryMetricRow
            durationSeconds={runDetail.run.durationSeconds}
            estimatedMinutes={runDetail.estimatedMinutes}
            earnedPoint={runDetail.earnedPoint}
          />

          <RunPointBreakdownCard pointBreakdown={runDetail.pointBreakdown} matchBonusLabel={matchBonusLabel} />

          {matchResult ? (
            <RunMatchResultCard
              matchResult={matchResult}
              matchBonusPoints={runDetail.pointBreakdown.matchBonusPoints}
            />
          ) : null}

          {mapRegion ? (
            <Card style={styles.mapCard}>
              <Text style={styles.sectionTitle}>러닝 경로</Text>
              <View style={styles.mapWrap}>
                <RunRouteMap
                  actualCoordinates={routeCoordinates}
                  latestCoordinate={latestCoordinate}
                  initialRegion={mapRegion}
                  emptyTitle="저장된 러닝 경로를 불러오는 중이에요."
                  emptyText="이 기록에는 지도 경로가 함께 저장돼 있어요."
                />
              </View>
            </Card>
          ) : null}

          {runDetail.run.durationSeconds || runDetail.run.cadenceSpm || runDetail.run.elevationGainM ? (
            <RunExtraMetricsRow
              cadenceSpm={runDetail.run.cadenceSpm}
              elevationGainM={runDetail.run.elevationGainM}
            />
          ) : null}

          <RunDetailInfoCard run={runDetail.run} sourceLabel={sourceLabel} weeklyDistanceKm={runDetail.weeklyDistanceKm} />

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
});
