import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { WeeklySummary } from '@/domain/types';

export function HomeOverview({ summary }: { summary: WeeklySummary }) {
  return (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>RUNNIGAPP</Text>
        <Text style={styles.title}>오늘도 경쟁은 계속된다</Text>
        <Text style={styles.subtitle}>친구 경쟁, 구 내 경쟁, 지역 배틀을 앱 하나에서 관리.</Text>
      </View>

      <Card>
        <SectionTitle>이번 주 요약</SectionTitle>
        <View style={styles.grid}>
          <Metric label="거리" value={`${summary.totalDistanceKm}km`} />
          <Metric label="러닝" value={`${summary.totalRuns}회`} />
          <Metric label="목표" value={`${summary.goalAchievementRate}%`} />
          <Metric label="streak" value={`${summary.streakDays}일`} />
        </View>
      </Card>

      <View style={styles.twoColumnRow}>
        <Card style={styles.halfCard}>
          <SectionTitle>친구 경쟁</SectionTitle>
          <Text style={styles.body}>{summary.friendName}와</Text>
          <Text style={styles.highlight}>{summary.friendGapKm}km 차이</Text>
          <Text style={styles.muted}>Point + km</Text>
        </Card>

        <Card style={styles.halfCard}>
          <SectionTitle>구 내 경쟁</SectionTitle>
          <Text style={styles.body}>{summary.districtName}</Text>
          <Text style={styles.highlight}>{summary.districtRank}위</Text>
          <Text style={styles.muted}>{summary.totalDistanceKm}km / {summary.districtPoints}P</Text>
        </Card>
      </View>

      <Card>
        <SectionTitle>지역 배틀</SectionTitle>
        <Text style={styles.body}>{summary.districtBattle.myDistrict} 평균 {summary.districtBattle.averageDistancePerMember}km</Text>
        <Text style={styles.muted}>총 거리 {summary.districtBattle.totalDistanceKm}km · 참여율 {summary.districtBattle.participationRate}% · {summary.districtBattle.districtRank}위</Text>
      </Card>

      <View style={styles.twoColumnRow}>
        <Card style={styles.halfCard}>
          <SectionTitle>기록 연동</SectionTitle>
          <Text style={styles.body}>Apple Health</Text>
          <Text style={styles.muted}>Garmin · NRC · Strava 확장</Text>
        </Card>

        <Card style={styles.halfCard}>
          <SectionTitle>최근 기록</SectionTitle>
          <Text style={styles.body}>{summary.latestRun.distanceKm}km 완료</Text>
          <Text style={styles.muted}>{summary.latestRun.source}</Text>
        </Card>
      </View>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: '#6D5EF7',
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  eyebrow: { color: '#E9E7FF', fontWeight: '700', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { color: '#F4F3FF', lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '47%',
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  metricLabel: { color: '#667085', fontSize: 12 },
  metricValue: { color: '#111827', fontSize: 20, fontWeight: '800' },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfCard: {
    flex: 1,
    minHeight: 132,
  },
  body: { color: '#101828', fontSize: 16, fontWeight: '700' },
  highlight: { color: '#6D5EF7', fontSize: 24, fontWeight: '800' },
  muted: { color: '#667085', lineHeight: 20 },
});
