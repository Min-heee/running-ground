import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { regionDrilldownTree } from '@/data/mock';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { RegionDrilldownNode } from '@/domain/types';

const FEATURED_REGION_COUNT = 6;

export default function LeagueScreen() {
  const [path, setPath] = useState<RegionDrilldownNode[]>([regionDrilldownTree]);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const currentNode = path[path.length - 1];
  const children = currentNode.children ?? [];
  const isCountry = currentNode.level === 'country';

  const breadcrumb = useMemo(() => path.map((node) => node.name).join(' > '), [path]);

  const sortedChildren = useMemo(() => [...children].sort((a, b) => a.rank - b.rank), [children]);

  const visibleChildren = useMemo(() => {
    if (!isCountry || showAllRegions) return sortedChildren;
    return sortedChildren.slice(0, FEATURED_REGION_COUNT);
  }, [sortedChildren, isCountry, showAllRegions]);

  return (
    <Screen>
      <PageHeader title="지역 배틀" subtitle="대한민국부터 시/도, 시/군/구까지 내려가며 경쟁 구도를 볼 수 있어." />

      <InfoCard title="탐색 방식">지역을 누르면 하위 지역으로 내려가고, 그 지역의 순위와 평균 km를 바로 확인할 수 있어.</InfoCard>

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
            <Text style={styles.heroMetricValue}>{isCountry ? `${currentNode.participants}명` : `${currentNode.averageDistanceKm}km`}</Text>
            <Text style={styles.heroMetricLabel}>{isCountry ? '회원 수' : '평균 거리'}</Text>
          </View>
        </View>
        {isCountry ? (
          <Text style={styles.heroFootnote}>참여율 {currentNode.participationRate}% · 하위 지역 {children.length}개</Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>지역 선택</SectionTitle>
        <View style={styles.selectorWrap}>
          {path.length > 1 ? (
            <Pressable style={styles.backButton} onPress={() => setPath((prev) => prev.slice(0, -1))}>
              <Text style={styles.backButtonText}>상위 지역으로</Text>
            </Pressable>
          ) : null}

          <View style={styles.regionGrid}>
            {visibleChildren.map((node) => (
              <Pressable key={node.id} style={styles.regionCard} onPress={() => setPath((prev) => [...prev, node])}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{node.rank}등</Text>
                </View>
                <Text style={styles.regionName}>{node.name}</Text>
                <Text style={styles.regionMeta}>평균 {node.averageDistanceKm}km</Text>
                <Text style={styles.regionMeta}>참여율 {node.participationRate}%</Text>
              </Pressable>
            ))}
            {children.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>더 내려갈 지역이 없어요</Text>
                <Text style={styles.emptyText}>현재 선택된 지역의 순위와 평균 km를 아래에서 확인하면 돼.</Text>
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
              <Text style={styles.summaryValue}>{currentNode.averageDistanceKm}km</Text>
              <Text style={styles.summaryLabel}>평균 거리</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{currentNode.participationRate}%</Text>
              <Text style={styles.summaryLabel}>참여율</Text>
            </View>
          </View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{currentNode.participants}명</Text>
              <Text style={styles.summaryLabel}>회원 수</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{currentNode.rank}위</Text>
              <Text style={styles.summaryLabel}>현재 순위</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{children.length > 0 ? '하위 지역 순위' : '현재 지역 정보'}</SectionTitle>
        {(children.length > 0 ? visibleChildren : [currentNode]).map((node) => (
          <View key={node.id} style={styles.rankRow}>
            <Text style={styles.rankNumber}>{node.rank}</Text>
            <View style={styles.rankMeta}>
              <Text style={styles.rankName}>{node.name}</Text>
              <Text style={styles.rankDetail}>{isCountry ? `총 거리 ${node.totalDistanceKm}km · 회원 ${node.participants}명 · 평균 ${node.averageDistanceKm}km` : `평균 ${node.averageDistanceKm}km · 참여율 ${node.participationRate}% · ${node.participants}명`}</Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
