import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { regionDrilldownTree } from '@/data/mock';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { RegionDrilldownNode } from '@/domain/types';
import { colors, radius } from '@/theme';

const FEATURED_REGION_COUNT = 6;

export default function LeagueScreen() {
  const [path, setPath] = useState<RegionDrilldownNode[]>([regionDrilldownTree]);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const currentNode = path[path.length - 1];
  const isCountry = currentNode.level === 'country';

  const breadcrumb = useMemo(() => path.map((node) => node.name).join(' > '), [path]);

  const sortedChildren = useMemo(
    () => [...(currentNode.children ?? [])].sort((a, b) => a.rank - b.rank),
    [currentNode],
  );

  const visibleChildren = useMemo(() => {
    if (!isCountry || showAllRegions) return sortedChildren;
    return sortedChildren.slice(0, FEATURED_REGION_COUNT);
  }, [sortedChildren, isCountry, showAllRegions]);

  const childCount = sortedChildren.length;

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
          <Text style={styles.heroFootnote}>참여율 {currentNode.participationRate}% · 하위 지역 {childCount}개</Text>
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
                <Text style={styles.regionMeta}>총거리 {node.totalDistanceKm}km</Text>
                <Text style={styles.regionMeta}>회원수 {node.participants}명</Text>
              </Pressable>
            ))}
            {childCount === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>더 내려갈 지역이 없어요</Text>
                <Text style={styles.emptyText}>현재 선택된 지역의 순위와 평균 km를 아래에서 확인하면 돼.</Text>
              </View>
            ) : null}
          </View>

          {isCountry && childCount > FEATURED_REGION_COUNT ? (
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
        <SectionTitle>{childCount > 0 ? '하위 지역 순위' : '현재 지역 정보'}</SectionTitle>
        {(childCount > 0 ? visibleChildren : [currentNode]).map((node) => (
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
    backgroundColor: colors.brandPrimary,
    gap: 10,
  },
  heroLabel: {
    color: colors.brandPrimaryTint,
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: colors.textOnDark,
    fontSize: 30,
    fontWeight: '800',
  },
  breadcrumb: {
    color: colors.brandPrimaryTint,
    lineHeight: 20,
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricBox: {
    flex: 1,
    backgroundColor: colors.overlayWhiteSoft,
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
    color: colors.brandPrimaryTint,
  },
  heroFootnote: {
    color: colors.brandPrimaryTint,
    lineHeight: 20,
  },
  selectorWrap: {
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandPrimarySoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  backButtonText: {
    color: colors.brandPrimaryDark,
    fontWeight: '800',
  },
  regionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  regionCard: {
    width: '47%',
    backgroundColor: colors.brandPrimaryGhost,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimaryTint,
    minHeight: 92,
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rankBadgeText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontWeight: '800',
  },
  regionName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
    marginTop: 26,
  },
  regionMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  toggleButton: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toggleButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  emptyState: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 16,
    gap: 6,
    width: '100%',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  summaryLabel: {
    color: colors.textMuted,
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rankNumber: {
    width: 24,
    fontWeight: '800',
    color: colors.textBody,
  },
  rankMeta: {
    flex: 1,
    gap: 2,
  },
  rankName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rankDetail: {
    color: colors.textMuted,
  },
});
