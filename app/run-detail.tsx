import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchRunDetail } from '@/lib/api/services';
import { RunDetailResponse } from '@/lib/api/types';
import { getRunSourceLabel } from '@/features/runs/sourceLabel';
import { formatDuration, getRunMapRegion } from '@/features/runs/tracking';

export default function RunDetailScreen() {
  const { runId, friendId } = useLocalSearchParams<{ runId?: string; friendId?: string }>();
  const [runDetail, setRunDetail] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRunDetail({ runId, friendId })
      .then((data) => setRunDetail(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '기록 상세 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, [friendId, runId]);

  const backHref: Href = friendId ? { pathname: '/friend-detail', params: { friendId } } : '/my-activity';
  const backLabel = friendId ? '친구 활동으로 돌아가기' : '내 활동으로 돌아가기';
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

          {mapRegion ? (
            <Card style={styles.mapCard}>
              <Text style={styles.sectionTitle}>러닝 경로</Text>
              <View style={styles.mapWrap}>
                <MapView
                  style={StyleSheet.absoluteFill}
                  initialRegion={mapRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                >
                  {routeCoordinates.length > 1 ? (
                    <Polyline coordinates={routeCoordinates} strokeColor="#6D5EF7" strokeWidth={5} />
                  ) : null}
                  {routeCoordinates.length ? (
                    <Marker coordinate={routeCoordinates[routeCoordinates.length - 1]} />
                  ) : null}
                </MapView>
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
