import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { WeeklySummary } from '@/domain/types';

export function HomeOverview({ summary }: { summary: WeeklySummary }) {
  return (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>RUNNIGAPP</Text>
        <Text style={styles.title}>오늘의 핵심 경쟁</Text>
        <Text style={styles.subtitle}>지금 가장 중요한 건 우리 지역의 순위와 평균 거리야.</Text>
      </View>

      <Card style={styles.heroBattleCard}>
        <Text style={styles.heroLabel}>우리 지역 배틀</Text>
        <Text style={styles.heroDistrict}>{summary.districtBattle.myDistrict}</Text>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{summary.districtBattle.districtRank}위</Text>
            <Text style={styles.heroMetricLabel}>현재 순위</Text>
          </View>
          <View style={styles.heroMetricBox}>
            <Text style={styles.heroMetricValue}>{summary.districtBattle.averageDistancePerMember}km</Text>
            <Text style={styles.heroMetricLabel}>평균 거리</Text>
          </View>
        </View>
        <Text style={styles.heroFootnote}>총 거리 {summary.districtBattle.totalDistanceKm}km · 참여율 {summary.districtBattle.participationRate}%</Text>
      </Card>

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

        <Link href="/district-personal" asChild>
          <Card style={styles.halfCard}>
            <SectionTitle>구 내 경쟁</SectionTitle>
            <Text style={styles.body}>{summary.districtName}</Text>
            <Text style={styles.highlight}>{summary.districtRank}위</Text>
            <Text style={styles.muted}>{summary.totalDistanceKm}km / {summary.districtPoints}P</Text>
          </Card>
        </Link>
      </View>

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
  heroBattleCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  heroLabel: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 12,
  },
  heroDistrict: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  heroMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroMetricLabel: {
    color: '#D0D5DD',
  },
  heroFootnote: {
    color: '#98A2B3',
    lineHeight: 20,
  },
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
