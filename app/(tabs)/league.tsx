import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { fetchRegionLeague } from '@/lib/api/services';
import { RegionLeagueResponse } from '@/lib/api/types';

const FEATURED_REGION_COUNT = 6;
const UNIVERSITY_RANKS = [
  { rank: 1, universityName: '서울대학교', totalDistanceKm: 312.4, participants: 18 },
  { rank: 2, universityName: '연세대학교', totalDistanceKm: 286.7, participants: 16 },
  { rank: 3, universityName: '고려대학교', totalDistanceKm: 271.9, participants: 15 },
  { rank: 4, universityName: '성균관대학교', totalDistanceKm: 224.8, participants: 13 },
  { rank: 5, universityName: '한양대학교', totalDistanceKm: 212.5, participants: 12 },
  { rank: 6, universityName: '경희대학교', totalDistanceKm: 194.3, participants: 11 },
  { rank: 7, universityName: '중앙대학교', totalDistanceKm: 181.6, participants: 10 },
  { rank: 8, universityName: '이화여자대학교', totalDistanceKm: 169.2, participants: 9 },
] as const;

type LeagueMode = 'region' | 'university';

export default function LeagueScreen() {
  const [leagueMode, setLeagueMode] = useState<LeagueMode>('region');
  const [league, setLeague] = useState<RegionLeagueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const currentNode = league?.currentNode ?? null;
  const children = league?.children ?? [];
  const isCountry = currentNode?.level === 'country';

  const loadLeague = (nodeId?: string) => {
    setLoading(true);
    setError(null);

    fetchRegionLeague(nodeId)
      .then((response) => {
        setLeague(response);
        setShowAllRegions(false);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '지역 리그 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeague();
  }, []);

  const breadcrumb = useMemo(() => league?.breadcrumb.map((node) => node.name).join(' > ') ?? '', [league]);

  const sortedChildren = useMemo(() => [...children].sort((a, b) => a.rank - b.rank), [children]);

  const visibleChildren = useMemo(() => {
    if (!isCountry || showAllRegions) return sortedChildren;
    return sortedChildren.slice(0, FEATURED_REGION_COUNT);
  }, [sortedChildren, isCountry, showAllRegions]);

  const canGoBack = (league?.breadcrumb.length ?? 0) > 1;
  const parentNodeId = canGoBack ? league?.breadcrumb[league.breadcrumb.length - 2]?.id : undefined;
  const featuredUniversityRank = UNIVERSITY_RANKS[0];
  const isUniversityView = leagueMode === 'university';

  return (
    <Screen>
      <PageHeader
        title="리그"
        subtitle={isUniversityView
          ? '학교별 총거리와 참가 인원 기준으로 대학 랭킹을 볼 수 있어.'
          : '대한민국부터 시/도, 시/군/구까지 내려가며 경쟁 구도를 볼 수 있어.'}
      />

      <Card style={styles.modeCard}>
        <View style={styles.modeSwitch}>
          <Pressable style={[styles.modeButton, !isUniversityView && styles.modeButtonActive]} onPress={() => setLeagueMode('region')}>
            <Text style={[styles.modeButtonText, !isUniversityView && styles.modeButtonTextActive]}>지역</Text>
          </Pressable>
          <Pressable style={[styles.modeButton, isUniversityView && styles.modeButtonActive]} onPress={() => setLeagueMode('university')}>
            <Text style={[styles.modeButtonText, isUniversityView && styles.modeButtonTextActive]}>대학</Text>
          </Pressable>
        </View>
      </Card>

      {isUniversityView ? (
        <>
          <InfoCard title="대학 리그">학교별 참가 인원이 모이면 자동으로 대학 랭킹이 만들어지고, 총거리 기준으로 순위가 정해져.</InfoCard>

          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>현재 1위 대학</Text>
            <Text style={styles.heroTitle}>{featuredUniversityRank.universityName}</Text>
            <Text style={styles.breadcrumb}>현재 참가 대학 {UNIVERSITY_RANKS.length}개가 집계되고 있어.</Text>
            <View style={styles.heroMetrics}>
              <View style={styles.heroMetricBox}>
                <Text style={styles.heroMetricValue}>{featuredUniversityRank.rank}위</Text>
                <Text style={styles.heroMetricLabel}>현재 순위</Text>
              </View>
              <View style={styles.heroMetricBox}>
                <Text style={styles.heroMetricValue}>{featuredUniversityRank.totalDistanceKm}km</Text>
                <Text style={styles.heroMetricLabel}>총거리</Text>
              </View>
            </View>
            <Text style={styles.heroFootnote}>회원 수 {featuredUniversityRank.participants}명</Text>
          </Card>

          <Card>
            <SectionTitle>대학 순위</SectionTitle>
            {UNIVERSITY_RANKS.map((rank) => (
              <View key={rank.universityName} style={styles.rankRow}>
                <Text style={styles.rankNumber}>{rank.rank}</Text>
                <View style={styles.rankMeta}>
                  <Text style={styles.rankName}>{rank.universityName}</Text>
                  <Text style={styles.rankDetail}>총 거리 {rank.totalDistanceKm}km · 회원 {rank.participants}명</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <>
          <InfoCard title="탐색 방식">지역을 누르면 하위 지역으로 내려가고, 그 지역의 순위와 총거리, 회원 수를 바로 확인할 수 있어.</InfoCard>

          {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

          {!loading && error ? (
            <Card>
              <Text style={styles.stateTitle}>지역 리그를 아직 못 불러왔어</Text>
              <Text style={styles.errorText}>{error}</Text>
              <PrimaryButton label="다시 불러오기" onPress={() => loadLeague(currentNode?.id)} />
            </Card>
          ) : null}

          {!loading && !error && !currentNode ? (
            <Card>
              <Text style={styles.stateTitle}>지역 리그 데이터가 아직 없어</Text>
              <Text style={styles.emptyText}>백엔드 응답이 연결되면 지역별 순위를 바로 탐색할 수 있어.</Text>
              <PrimaryButton label="다시 불러오기" onPress={() => loadLeague()} />
            </Card>
          ) : null}

          {currentNode ? (
            <>
              <Card style={styles.heroCard}>
                <Text style={styles.heroLabel}>현재 선택 지역</Text>
                <Text style={styles.heroTitle}>{currentNode.name}</Text>
                <Text style={styles.breadcrumb}>{breadcrumb}</Text>
                <View style={styles.heroMetrics}>
                  <View style={styles.heroMetricBox}>
                    <Text style={styles.heroMetricValue}>{isCountry ? `${currentNode.totalDistanceKm}km` : `${currentNode.rank}위`}</Text>
                    <Text style={styles.heroMetricLabel}>{isCountry ? '회원 총 거리' : '현재 순위'}</Text>
                  </View>
                  <View style={styles.heroMetricBox}>
                    <Text style={styles.heroMetricValue}>{currentNode.participants}명</Text>
                    <Text style={styles.heroMetricLabel}>회원 수</Text>
                  </View>
                </View>
                <Text style={styles.heroFootnote}>총 거리 {currentNode.totalDistanceKm}km · 참여율 {currentNode.participationRate}%</Text>
              </Card>

              <Card>
                <SectionTitle>지역 선택</SectionTitle>
                <View style={styles.selectorWrap}>
                  {canGoBack ? (
                    <Pressable style={styles.backButton} onPress={() => loadLeague(parentNodeId)}>
                      <Text style={styles.backButtonText}>상위 지역으로</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.regionGrid}>
                    {visibleChildren.map((node) => (
                      <Pressable key={node.id} style={styles.regionCard} onPress={() => loadLeague(node.id)}>
                        <View style={styles.rankBadge}>
                          <Text style={styles.rankBadgeText}>{node.rank}등</Text>
                        </View>
                        <Text style={styles.regionName}>{node.name}</Text>
                        <Text style={styles.regionMeta}>총거리 {node.totalDistanceKm}km</Text>
                        <Text style={styles.regionMeta}>회원수 {node.participants}명</Text>
                      </Pressable>
                    ))}
                    {children.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>더 내려갈 지역이 없어요</Text>
                        <Text style={styles.emptyText}>현재 선택된 지역의 순위와 총거리, 회원 수는 위 카드에서 바로 확인하면 돼.</Text>
                      </View>
                    ) : null}
                  </View>

                  {isCountry && children.length > FEATURED_REGION_COUNT ? (
                    <Pressable style={styles.toggleButton} onPress={() => setShowAllRegions((prev) => !prev)}>
                      <Text style={styles.toggleButtonText}>{showAllRegions ? '대표 지역만 보기' : '전체 지역 보기'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>

              {!isCountry ? (
                <Card>
                  <SectionTitle>선택 지역 현황</SectionTitle>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryValue}>{currentNode.rank}위</Text>
                      <Text style={styles.summaryLabel}>현재 순위</Text>
                    </View>
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryValue}>{currentNode.totalDistanceKm}km</Text>
                      <Text style={styles.summaryLabel}>총거리</Text>
                    </View>
                  </View>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryValue}>{currentNode.participants}명</Text>
                      <Text style={styles.summaryLabel}>회원 수</Text>
                    </View>
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryValue}>{currentNode.participationRate}%</Text>
                      <Text style={styles.summaryLabel}>참여율</Text>
                    </View>
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeCard: {
    padding: 6,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F2F4F7',
    borderRadius: 18,
    padding: 4,
    gap: 6,
  },
  modeButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  modeButtonText: {
    color: '#667085',
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#111827',
  },
  heroCard: {
    backgroundColor: '#6D5EF7',
    gap: 10,
  },
  heroLabel: {
    color: '#E9E7FF',
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  breadcrumb: {
    color: '#E9E7FF',
    lineHeight: 20,
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
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
    color: '#E9E7FF',
  },
  heroFootnote: {
    color: '#E9E7FF',
    lineHeight: 20,
  },
  selectorWrap: {
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backButtonText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  regionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  regionCard: {
    width: '47%',
    backgroundColor: '#F8F7FF',
    borderRadius: 16,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E9E7FF',
    minHeight: 92,
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#6D5EF7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  regionName: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
    marginTop: 26,
  },
  regionMeta: {
    color: '#667085',
    fontSize: 12,
  },
  toggleButton: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toggleButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    width: '100%',
  },
  emptyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  summaryLabel: {
    color: '#667085',
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  rankNumber: {
    width: 24,
    fontWeight: '800',
    color: '#344054',
  },
  rankMeta: {
    flex: 1,
    gap: 2,
  },
  rankName: {
    color: '#111827',
    fontWeight: '700',
  },
  rankDetail: {
    color: '#667085',
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
});
