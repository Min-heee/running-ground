import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { myProfile } from '@/data/mock';
import { fetchDistrictPersonal, fetchRegionLeague, fetchUniversityLeague } from '@/lib/api/services';
import { DistrictPersonalResponse, RegionLeagueResponse, UniversityLeagueResponse } from '@/lib/api/types';
import { getCurrentUserProfile } from '@/lib/session';

const FEATURED_REGION_COUNT = 6;

type LeagueMode = 'region' | 'university';

export default function LeagueScreen() {
  const scrollRef = useRef<ScrollView | null>(null);
  const [leagueMode, setLeagueMode] = useState<LeagueMode>('region');
  const [league, setLeague] = useState<RegionLeagueResponse | null>(null);
  const [universityLeague, setUniversityLeague] = useState<UniversityLeagueResponse | null>(null);
  const [regionMembers, setRegionMembers] = useState<DistrictPersonalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [universityLoading, setUniversityLoading] = useState(true);
  const [universityError, setUniversityError] = useState<string | null>(null);
  const [regionMembersLoading, setRegionMembersLoading] = useState(false);
  const [regionMembersError, setRegionMembersError] = useState<string | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [memberRankCardY, setMemberRankCardY] = useState(0);
  const [myRankRowY, setMyRankRowY] = useState<number | null>(null);
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

  const loadUniversityLeague = () => {
    setUniversityLoading(true);
    setUniversityError(null);

    fetchUniversityLeague()
      .then((response) => setUniversityLeague(response))
      .catch((loadError) => setUniversityError(loadError instanceof Error ? loadError.message : '대학 리그 정보를 불러오지 못했어.'))
      .finally(() => setUniversityLoading(false));
  };

  const loadRegionMembers = (nodeId: string) => {
    setRegionMembersLoading(true);
    setRegionMembersError(null);
    setMyRankRowY(null);

    fetchDistrictPersonal(nodeId)
      .then((response) => setRegionMembers(response))
      .catch((loadError) => setRegionMembersError(loadError instanceof Error ? loadError.message : '이 지역 회원 순위를 불러오지 못했어.'))
      .finally(() => setRegionMembersLoading(false));
  };

  useEffect(() => {
    loadLeague();
    loadUniversityLeague();
  }, []);

  const breadcrumbNodes = useMemo(() => league?.breadcrumb ?? [], [league]);
  const navigationPath = useMemo(
    () => breadcrumbNodes.filter((node) => node.level !== 'country'),
    [breadcrumbNodes],
  );
  const breadcrumb = useMemo(
    () => (navigationPath.length > 0 ? navigationPath.map((node) => node.name).join(' -> ') : '대한민국'),
    [navigationPath],
  );

  const sortedChildren = useMemo(() => [...children].sort((a, b) => a.rank - b.rank), [children]);
  const visibleChildren = useMemo(() => {
    if (!isCountry || showAllRegions) return sortedChildren;
    return sortedChildren.slice(0, FEATURED_REGION_COUNT);
  }, [sortedChildren, isCountry, showAllRegions]);

  const featuredUniversityRank = universityLeague?.ranks[0] ?? null;
  const isUniversityView = leagueMode === 'university';
  const isLeafRegion = !isUniversityView && Boolean(currentNode) && children.length === 0;
  const profile = getCurrentUserProfile() ?? myProfile;

  const isMyRegionNode = (node: { level: 'country' | 'province' | 'city' | 'district'; name: string }) => {
    switch (node.level) {
      case 'province':
        return node.name === profile.provinceName;
      case 'city':
        return node.name === profile.cityName;
      case 'district':
        return node.name === profile.districtName;
      default:
        return false;
    }
  };

  useEffect(() => {
    if (!isLeafRegion || !currentNode) {
      setRegionMembers(null);
      setRegionMembersError(null);
      setRegionMembersLoading(false);
      setMyRankRowY(null);
      return;
    }

    loadRegionMembers(currentNode.id);
  }, [currentNode?.id, isLeafRegion]);

  const scrollToMyRank = () => {
    if (myRankRowY === null) {
      return;
    }

    scrollRef.current?.scrollTo({
      y: Math.max(0, memberRankCardY + myRankRowY - 180),
      animated: true,
    });
  };

  return (
    <Screen scrollRef={scrollRef}>
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

          {universityLoading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

          {!universityLoading && universityError ? (
            <Card>
              <Text style={styles.stateTitle}>대학 리그를 아직 못 불러왔어</Text>
              <Text style={styles.errorText}>{universityError}</Text>
              <PrimaryButton label="다시 불러오기" onPress={loadUniversityLeague} />
            </Card>
          ) : null}

          {!universityLoading && !universityError && !featuredUniversityRank ? (
            <Card>
              <Text style={styles.stateTitle}>아직 집계된 대학이 없어</Text>
              <Text style={styles.emptyText}>회원가입에서 대학을 선택한 사용자가 생기면 여기서 바로 학교별 순위를 볼 수 있어.</Text>
              <PrimaryButton label="다시 불러오기" onPress={loadUniversityLeague} />
            </Card>
          ) : null}

          {featuredUniversityRank ? (
            <>
              <Card style={styles.heroCard}>
                <Text style={styles.heroLabel}>현재 1위 대학</Text>
                <Text style={styles.heroTitle}>{featuredUniversityRank.universityName}</Text>
                <Text style={styles.breadcrumb}>현재 참가 대학 {universityLeague?.ranks.length ?? 0}개가 집계되고 있어.</Text>
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
                {universityLeague?.ranks.map((rank) => (
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
          ) : null}
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
                <View style={styles.heroLabelRow}>
                  <Text style={styles.heroLabel}>현재 선택 지역</Text>
                  {isMyRegionNode(currentNode) ? (
                    <View style={styles.myRegionBadgeOnDark}>
                      <Text style={styles.myRegionBadgeOnDarkText}>내 지역</Text>
                    </View>
                  ) : null}
                </View>
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
                  <View style={styles.pathBlock}>
                    <Text style={styles.pathLabel}>현재 경로</Text>
                    <View style={styles.pathRow}>
                      {breadcrumbNodes.length > 0 ? breadcrumbNodes.map((node, index) => {
                        const isCurrentPath = index === breadcrumbNodes.length - 1;
                        const isRootPath = node.level === 'country';

                        return (
                          <View key={node.id} style={styles.pathItemWrap}>
                            <Pressable
                              style={[styles.pathChip, isCurrentPath && styles.pathChipActive]}
                              onPress={() => !isCurrentPath && loadLeague(isRootPath ? undefined : node.id)}
                              disabled={isCurrentPath}
                            >
                              <View style={styles.pathChipInner}>
                                <Text style={[styles.pathChipText, isCurrentPath && styles.pathChipTextActive]}>
                                  {node.name}
                                </Text>
                                {isMyRegionNode(node) ? (
                                  <View style={[styles.myRegionBadge, isCurrentPath && styles.myRegionBadgeActive]}>
                                    <Text style={[styles.myRegionBadgeText, isCurrentPath && styles.myRegionBadgeTextActive]}>내 지역</Text>
                                  </View>
                                ) : null}
                              </View>
                            </Pressable>
                            {!isCurrentPath ? <Text style={styles.pathArrow}>-&gt;</Text> : null}
                          </View>
                        );
                      }) : <Text style={styles.pathRootText}>대한민국</Text>}
                    </View>
                  </View>

                  {children.length > 0 ? (
                    <View style={styles.regionGrid}>
                      {visibleChildren.map((node) => (
                        <Pressable
                          key={node.id}
                          style={[styles.regionCard, isMyRegionNode(node) && styles.regionCardMy]}
                          onPress={() => loadLeague(node.id)}
                        >
                          <View style={styles.rankBadge}>
                            <Text style={styles.rankBadgeText}>{node.rank}등</Text>
                          </View>
                          {isMyRegionNode(node) ? (
                            <View style={styles.regionMyBadge}>
                              <Text style={styles.regionMyBadgeText}>내 지역</Text>
                            </View>
                          ) : null}
                          <Text style={styles.regionName}>{node.name}</Text>
                          <Text style={styles.regionMeta}>총거리 {node.totalDistanceKm}km</Text>
                          <Text style={styles.regionMeta}>회원수 {node.participants}명</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

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

              {isLeafRegion ? (
                <>
                  {regionMembersLoading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

                  {!regionMembersLoading && regionMembersError ? (
                    <Card>
                      <Text style={styles.stateTitle}>회원 순위를 아직 못 불러왔어</Text>
                      <Text style={styles.errorText}>{regionMembersError}</Text>
                      <PrimaryButton label="다시 불러오기" onPress={() => currentNode && loadRegionMembers(currentNode.id)} />
                    </Card>
                  ) : null}

                  {!regionMembersLoading && !regionMembersError && regionMembers ? (
                    <Card onLayout={(event) => setMemberRankCardY(event.nativeEvent.layout.y)}>
                      <View style={styles.memberHeader}>
                        <View style={styles.memberHeaderCopy}>
                          <Text style={styles.sectionTitle}>{regionMembers.districtName} 회원 순위</Text>
                          <Text style={styles.memberHeaderText}>해당 지역 회원들이 이번 주에 달린 거리와 포인트 순으로 정렬돼 있어.</Text>
                        </View>

                        {regionMembers.myRank ? (
                          <Pressable style={styles.myRankButton} onPress={scrollToMyRank}>
                            <Text style={styles.myRankButtonText}>내 순위 보기</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {regionMembers.myRank ? (
                        <View style={styles.myRankSummary}>
                          <Text style={styles.myRankSummaryText}>내 현재 순위 {regionMembers.myRank.rank}위</Text>
                          <Text style={styles.myRankSummaryText}>{regionMembers.myRank.distanceKm}km · {regionMembers.myRank.points}P</Text>
                        </View>
                      ) : null}

                      {regionMembers.ranks.map((runner) => (
                        <View
                          key={runner.id}
                          style={[styles.rankRow, runner.isFriend && styles.friendRow, runner.isMe && styles.meRow]}
                          onLayout={runner.isMe ? (event) => setMyRankRowY(event.nativeEvent.layout.y) : undefined}
                        >
                          <Text style={styles.rankNumber}>{runner.rank}</Text>
                          <View style={styles.rankMeta}>
                            <View style={styles.rankNameRow}>
                              <Text style={styles.rankName}>{runner.name}</Text>
                              {runner.isFriend && !runner.isMe ? (
                                <View style={styles.friendBadge}>
                                  <Text style={styles.friendBadgeText}>친구</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.rankDetail}>{runner.distanceKm}km / {runner.points}P</Text>
                          </View>
                        </View>
                      ))}
                    </Card>
                  ) : null}
                </>
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
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
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
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  pathBlock: {
    gap: 8,
  },
  pathLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  pathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  pathItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pathChip: {
    backgroundColor: '#F2F4F7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pathChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pathChipActive: {
    backgroundColor: '#111827',
  },
  pathChipText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
  },
  pathChipTextActive: {
    color: '#FFFFFF',
  },
  pathArrow: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '800',
  },
  pathRootText: {
    color: '#111827',
    fontWeight: '800',
  },
  myRegionBadge: {
    backgroundColor: '#D1FADF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  myRegionBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  myRegionBadgeText: {
    color: '#067647',
    fontSize: 10,
    fontWeight: '800',
  },
  myRegionBadgeTextActive: {
    color: '#FFFFFF',
  },
  myRegionBadgeOnDark: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  myRegionBadgeOnDarkText: {
    color: '#FFFFFF',
    fontSize: 10,
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
  regionCardMy: {
    backgroundColor: '#EEFDF3',
    borderColor: '#ABEFC6',
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
  regionMyBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#12B76A',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  regionMyBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
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
  meRow: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  friendRow: {
    backgroundColor: '#ECFDF3',
    borderRadius: 14,
    paddingHorizontal: 10,
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
  rankNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankName: {
    color: '#111827',
    fontWeight: '700',
  },
  friendBadge: {
    backgroundColor: '#12B76A',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  friendBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  rankDetail: {
    color: '#667085',
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  memberHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  memberHeaderText: {
    color: '#667085',
    lineHeight: 20,
  },
  myRankButton: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myRankButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  myRankSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  myRankSummaryText: {
    color: '#344054',
    fontWeight: '700',
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
