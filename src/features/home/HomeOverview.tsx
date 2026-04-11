import { StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { OfflineRaceEvent, WeeklySummary } from '@/domain/types';

type HomeFriendOverview = {
  myRank: number | null;
  totalParticipants: number;
  leaderName: string;
};

const raceDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function HomeOverview({
  summary,
  friendOverview,
  nextRace,
}: {
  summary: WeeklySummary;
  friendOverview: HomeFriendOverview | null;
  nextRace: OfflineRaceEvent | null;
}) {
  const friendRankLabel = friendOverview?.myRank ? `${friendOverview.myRank}위` : '친구 추가';
  const friendSubLabel = friendOverview?.myRank
    ? friendOverview.myRank === 1
      ? `지금 ${friendOverview.totalParticipants}명 중 1위를 달리고 있어요`
      : `1위 ${friendOverview.leaderName} · ${summary.friendGapKm}km 차이`
    : '친구를 추가하면 내 순위를 바로 볼 수 있어요';
  const nextRaceTitle = nextRace?.title ?? '다음 레이스 준비 중';
  const nextRaceTime = nextRace ? raceDateFormatter.format(new Date(nextRace.startsAt)) : '일정 업데이트 예정';
  const nextRaceDeadline = nextRace
    ? `${raceDateFormatter.format(new Date(nextRace.registrationClosesAt))} 마감`
    : '다음 회차가 열리면 바로 확인할 수 있어요';

  return (
    <>
      <Pressable onPress={() => router.push('/(tabs)/league')}>
        <Card style={styles.regionCard}>
          <Text style={styles.darkEyebrow}>우리 지역 배틀</Text>
          <Text style={styles.regionTitle}>{summary.districtBattle.myDistrict}</Text>
          <View style={styles.regionMetricRow}>
            <View style={styles.regionMetricBox}>
              <Text style={styles.regionMetricLabel}>현재 순위</Text>
              <Text style={styles.regionMetricValue}>{summary.districtBattle.districtRank}위</Text>
            </View>
            <View style={styles.regionMetricBox}>
              <Text style={styles.regionMetricLabel}>총거리</Text>
              <Text style={styles.regionMetricValue}>{summary.districtBattle.totalDistanceKm}km</Text>
            </View>
          </View>
          <Text style={styles.regionFootnote}>참여율 {summary.districtBattle.participationRate}%</Text>
        </Card>
      </Pressable>

      <Card style={styles.statusCard}>
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>이번 주 거리</Text>
          <Text style={styles.statusValue}>{summary.totalDistanceKm}km</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>러닝</Text>
          <Text style={styles.statusValue}>{summary.totalRuns}회</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>연속</Text>
          <Text style={styles.statusValue}>{summary.streakDays}일</Text>
        </View>
      </Card>

      <View style={styles.twoColumnRow}>
        <Pressable
          style={styles.linkCardWrap}
          onPress={() => router.push({ pathname: '/(tabs)/friends', params: { scrollToTop: Date.now().toString() } })}
        >
          <Card style={styles.compactCard}>
            <Text style={styles.cardEyebrow}>친구 랭킹</Text>
            <Text style={styles.compactLabel}>내 순위</Text>
            <Text style={styles.compactValue}>{friendRankLabel}</Text>
            <Text style={styles.muted}>{friendSubLabel}</Text>
          </Card>
        </Pressable>

        <Pressable
          style={styles.linkCardWrap}
          onPress={() => router.push({ pathname: '/(tabs)/race', params: { scrollToTop: Date.now().toString() } })}
        >
          <Card style={styles.compactCard}>
            <Text style={styles.cardEyebrow}>다음 레이스</Text>
            <Text style={styles.compactLabel}>{nextRaceTitle}</Text>
            <Text style={styles.compactValueSmall}>{nextRaceTime}</Text>
            <Text style={styles.muted}>{nextRaceDeadline}</Text>
          </Card>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  regionCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  darkEyebrow: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 12,
  },
  regionTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  regionMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  regionMetricBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  regionMetricLabel: {
    color: '#D0D5DD',
    fontSize: 12,
  },
  regionMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  regionFootnote: {
    color: '#98A2B3',
    lineHeight: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 14,
  },
  statusMetric: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  statusLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  statusValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  statusDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  linkCardWrap: {
    flex: 1,
  },
  compactCard: {
    minHeight: 156,
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  compactLabel: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '600',
  },
  compactValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  compactValueSmall: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  muted: { color: '#667085', lineHeight: 20 },
});
