import { StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { WeeklySummary } from '@/domain/types';
import { colors, radius } from '@/theme';

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
        <Pressable style={styles.heroAction} onPress={() => router.push('/(tabs)/league')}>
          <Text style={styles.heroActionText}>지역 경쟁 자세히 보기</Text>
        </Pressable>
      </Card>

      <Card>
        <SectionTitle>빠른 이동</SectionTitle>
        <View style={styles.quickActionGrid}>
          <Pressable style={styles.quickActionCard} onPress={() => router.push('/(tabs)/friends')}>
            <Text style={styles.quickActionTitle}>친구 랭킹</Text>
            <Text style={styles.quickActionSub}>친구 경쟁 보러가기</Text>
          </Pressable>
          <Pressable style={styles.quickActionCard} onPress={() => router.push('/my-activity')}>
            <Text style={styles.quickActionTitle}>내 활동</Text>
            <Text style={styles.quickActionSub}>내가 뛴 기록 보기</Text>
          </Pressable>
          <Pressable style={styles.quickActionCard} onPress={() => router.push('/district-personal')}>
            <Text style={styles.quickActionTitle}>구 내 경쟁</Text>
            <Text style={styles.quickActionSub}>내 순위 확인하기</Text>
          </Pressable>
          <Pressable style={styles.quickActionCard} onPress={() => router.push('/(tabs)/mypage')}>
            <Text style={styles.quickActionTitle}>마이페이지</Text>
            <Text style={styles.quickActionSub}>설정 관리하기</Text>
          </Pressable>
        </View>
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
        <Pressable style={styles.linkCardWrap} onPress={() => router.push('/(tabs)/friends')}>
          <Card style={styles.halfCard}>
            <SectionTitle>친구 경쟁</SectionTitle>
            <Text style={styles.body}>{summary.friendName}와</Text>
            <Text style={styles.highlight}>{summary.friendGapKm}km 차이</Text>
            <Text style={styles.muted}>Point + km</Text>
          </Card>
        </Pressable>

        <Pressable style={styles.linkCardWrap} onPress={() => router.push('/district-personal')}>
          <Card style={styles.halfCard}>
            <SectionTitle>구 내 경쟁</SectionTitle>
            <Text style={styles.body}>{summary.districtName}</Text>
            <Text style={styles.highlight}>{summary.districtRank}위</Text>
            <Text style={styles.muted}>{summary.totalDistanceKm}km / {summary.districtPoints}P</Text>
          </Card>
        </Pressable>
      </View>

      <View style={styles.twoColumnRow}>
        <Pressable style={styles.linkCardWrap} onPress={() => router.push('/integration-management')}>
          <Card style={styles.halfCard}>
            <SectionTitle>기록 연동</SectionTitle>
            <Text style={styles.body}>Apple Health</Text>
            <Text style={styles.muted}>Garmin · NRC · Strava 확장</Text>
          </Card>
        </Pressable>

        <Pressable style={styles.linkCardWrap} onPress={() => router.push('/my-activity')}>
          <Card style={styles.halfCard}>
            <SectionTitle>최근 기록</SectionTitle>
            <Text style={styles.body}>{summary.latestRun.distanceKm}km 완료</Text>
            <Text style={styles.muted}>{summary.latestRun.source}</Text>
          </Card>
        </Pressable>
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
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.xxxl,
    padding: 20,
    gap: 8,
  },
  eyebrow: { color: colors.brandPrimaryTint, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.textOnDark },
  subtitle: { color: colors.brandPrimaryHero, lineHeight: 21 },
  heroBattleCard: {
    backgroundColor: colors.inkBg,
    gap: 10,
  },
  heroLabel: {
    color: colors.brandPrimaryMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  heroDistrict: {
    color: colors.textOnDark,
    fontSize: 30,
    fontWeight: '800',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: colors.inkBgAlt,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
  },
  heroMetricValue: {
    color: colors.textOnDark,
    fontSize: 22,
    fontWeight: '800',
  },
  heroMetricLabel: {
    color: colors.textOnDarkMuted,
  },
  heroFootnote: {
    color: colors.textOnDarkSubtle,
    lineHeight: 20,
  },
  heroAction: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  heroActionText: {
    color: colors.textOnDark,
    fontWeight: '800',
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionCard: {
    width: '47%',
    backgroundColor: colors.brandPrimaryGhost,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimaryTint,
  },
  quickActionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  quickActionSub: {
    color: colors.textMuted,
    fontSize: 13,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '47%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
  },
  metricLabel: { color: colors.textMuted, fontSize: 12 },
  metricValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  linkCardWrap: {
    flex: 1,
  },
  halfCard: {
    flex: 1,
    minHeight: 132,
  },
  body: { color: colors.textTitle, fontSize: 16, fontWeight: '700' },
  highlight: { color: colors.brandPrimary, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
});
