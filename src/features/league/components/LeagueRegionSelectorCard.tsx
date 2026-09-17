import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { RegionDrilldownNode } from '@/domain';
import type { RegionBreadcrumbItem } from '@/lib/api/types';
import { PodiumBadge } from '@/features/league/components/LeagueRankBadges';
import { RegionStarBadge } from '@/features/league/components/RegionStarBadge';
import { getPodiumTheme } from '@/features/league/utils/leagueRanking';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatDistanceKm, formatPeopleCount } from '@/utils/formatUnits';

type LeagueRegionSelectorCardProps = {
  breadcrumbNodes: RegionBreadcrumbItem[];
  visibleChildren: RegionDrilldownNode[];
  isMyRegionNode: (node: Pick<RegionDrilldownNode, 'level' | 'name'>) => boolean;
  onSelectRegion: (nodeId?: string) => void;
};

type RegionNodeIdentity = Pick<RegionDrilldownNode, 'level' | 'name'>;

// 순위 기준 안내 (오너 2026-07-31) — 네이버 '기자 ▾ 연재 ▾'처럼 눌러서 펼치는 칩.
// 지역 순위는 인당 평균(총거리 ÷ 회원수) 순이라, 회원이 많은 지역이 무조건 유리하지
// 않다는 걸 알려준다. 서버 정렬(normalizeRegionChildren)과 문구를 일치시킬 것.
const RankCriteriaPanel = memo(function RankCriteriaPanel() {
  return (
    <View style={styles.criteriaPanel}>
      <Text style={styles.criteriaHeadline}>순위는 인당 평균 거리 순이에요</Text>
      <Text style={styles.criteriaLine}>
        <Text style={styles.criteriaEmphasis}>인당 평균</Text> = 이번 달 총거리 ÷ 회원수
      </Text>
      <Text style={styles.criteriaLine}>
        <Text style={styles.criteriaEmphasis}>총거리</Text> = 지역 회원들이 이번 달 달린 거리의 합
        (다른 앱에서 가져온 기록도 포함)
      </Text>
      <Text style={styles.criteriaLine}>
        <Text style={styles.criteriaEmphasis}>회원수</Text> = 그 지역을 선택한 회원 수
      </Text>
      <Text style={styles.criteriaFootnote}>
        평균이 같으면 총거리 → 회원수 순으로 앞섭니다. 매달 1일에 새로 시작합니다.
      </Text>
    </View>
  );
});

export const LeagueRegionSelectorCard = memo(function LeagueRegionSelectorCard({
  breadcrumbNodes,
  visibleChildren,
  isMyRegionNode,
  onSelectRegion,
}: LeagueRegionSelectorCardProps) {
  const [criteriaExpanded, setCriteriaExpanded] = useState(false);
  const toggleCriteria = useCallback(() => setCriteriaExpanded((current) => !current), []);

  return (
    <Card>
      <View style={styles.headerRow}>
        <SectionTitle>지역 선택</SectionTitle>
        <Pressable
          style={styles.criteriaChip}
          onPress={toggleCriteria}
          accessibilityRole="button"
          accessibilityLabel="지역 순위 기준 설명 보기"
          hitSlop={8}
        >
          <Text style={styles.criteriaChipText}>순위 기준</Text>
          <Feather
            name={criteriaExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.brandStrong}
          />
        </Pressable>
      </View>
      {criteriaExpanded ? <RankCriteriaPanel /> : null}
      <View style={styles.selectorWrap}>
        <LeagueBreadcrumbPath
          breadcrumbNodes={breadcrumbNodes}
          isMyRegionNode={isMyRegionNode}
          onSelectRegion={onSelectRegion}
        />
        <LeagueRegionGrid
          nodes={visibleChildren}
          isMyRegionNode={isMyRegionNode}
          onSelectRegion={onSelectRegion}
        />
      </View>
    </Card>
  );
});

function LeagueBreadcrumbPath({
  breadcrumbNodes,
  isMyRegionNode,
  onSelectRegion,
}: {
  breadcrumbNodes: RegionBreadcrumbItem[];
  isMyRegionNode: (node: RegionNodeIdentity) => boolean;
  onSelectRegion: (nodeId?: string) => void;
}) {
  const breadcrumbItems = useMemo(() => breadcrumbNodes.map((node, index) => (
    <LeagueBreadcrumbItem
      key={node.id}
      isCurrentPath={index === breadcrumbNodes.length - 1}
      isMyRegion={isMyRegionNode(node)}
      node={node}
      onSelectRegion={onSelectRegion}
    />
  )), [breadcrumbNodes, isMyRegionNode, onSelectRegion]);

  return (
    <View style={styles.pathBlock}>
      <Text style={styles.pathLabel}>현재 경로</Text>
      <View style={styles.pathRow}>
        {breadcrumbNodes.length > 0 ? breadcrumbItems : <Text style={styles.pathRootText}>대한민국</Text>}
      </View>
    </View>
  );
}

const LeagueBreadcrumbItem = memo(function LeagueBreadcrumbItem({
  isCurrentPath,
  isMyRegion,
  node,
  onSelectRegion,
}: {
  isCurrentPath: boolean;
  isMyRegion: boolean;
  node: RegionBreadcrumbItem;
  onSelectRegion: (nodeId?: string) => void;
}) {
  const isRootPath = node.level === 'country';
  const handleSelect = useCallback(() => {
    if (!isCurrentPath) {
      onSelectRegion(isRootPath ? undefined : node.id);
    }
  }, [isCurrentPath, isRootPath, node.id, onSelectRegion]);

  return (
    <View style={styles.pathItemWrap}>
      <Pressable
        style={[styles.pathChip, isCurrentPath && styles.pathChipActive]}
        onPress={handleSelect}
        disabled={isCurrentPath}
      >
        <View style={styles.pathChipInner}>
          <Text style={[styles.pathChipText, isCurrentPath && styles.pathChipTextActive]}>{node.name}</Text>
          <MyRegionBadge active={isCurrentPath} visible={isMyRegion} />
        </View>
      </Pressable>
      {!isCurrentPath ? <Text style={styles.pathArrow}>-&gt;</Text> : null}
    </View>
  );
});

const LeagueRegionGrid = memo(function LeagueRegionGrid({
  nodes,
  isMyRegionNode,
  onSelectRegion,
}: {
  nodes: RegionDrilldownNode[];
  isMyRegionNode: (node: RegionNodeIdentity) => boolean;
  onSelectRegion: (nodeId: string) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <View style={styles.regionGrid}>
      {nodes.map((node, index) => {
        if (index % 2 !== 0) {
          return null;
        }
        const nextNode = nodes[index + 1];

        return (
          <View key={node.id} style={styles.regionGridRow}>
            <LeagueRegionCard
              node={node}
              isMyRegion={isMyRegionNode(node)}
              onSelectRegion={onSelectRegion}
            />
            {nextNode ? (
              <LeagueRegionCard
                node={nextNode}
                isMyRegion={isMyRegionNode(nextNode)}
                onSelectRegion={onSelectRegion}
              />
            ) : (
              // 홀수 마지막 행: 빈 자리를 채워 카드가 반폭을 유지하게 한다.
              <View style={styles.regionCardSpacer} />
            )}
          </View>
        );
      })}
    </View>
  );
});

const LeagueRegionCard = memo(function LeagueRegionCard({
  node,
  isMyRegion,
  onSelectRegion,
}: {
  node: RegionDrilldownNode;
  isMyRegion: boolean;
  onSelectRegion: (nodeId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelectRegion(node.id);
  }, [node.id, onSelectRegion]);

  return (
    <Pressable style={[styles.regionCard, isMyRegion && styles.regionCardMy]} onPress={handleSelect}>
      {getPodiumTheme(node.rank) ? (
        <PodiumBadge rank={node.rank} compact />
      ) : (
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>{node.rank}등</Text>
        </View>
      )}
      {isMyRegion ? (
        <View style={styles.regionMyBadge}>
          <Text style={styles.regionMyBadgeText}>내 지역</Text>
        </View>
      ) : null}
      {/* 이름 옆 ★ (오너 2026-09-05: 이름 아래가 아니라 옆) — 탭하면 우승 달 말풍선.
          flexWrap이라 말풍선(width 100%)은 다음 줄로 떨어져 카드 안에서 펼쳐진다. */}
      <View style={styles.regionNameRow}>
        <Text style={styles.regionName}>{node.name}</Text>
        {typeof node.stars === 'number' && node.stars > 0 ? (
          <RegionStarBadge stars={node.stars} starMonths={node.starMonths} />
        ) : null}
      </View>
      <Text style={styles.regionMeta}>총거리 {formatDistanceKm(node.totalDistanceKm)}</Text>
      <Text style={styles.regionMeta}>회원수 {formatPeopleCount(node.participants)}</Text>
    </Pressable>
  );
});

function MyRegionBadge({ active, visible }: { active: boolean; visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.myRegionBadge, active && styles.myRegionBadgeActive]}>
      <Text style={[styles.myRegionBadgeText, active && styles.myRegionBadgeTextActive]}>내 지역</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  criteriaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.md,
  },
  criteriaChipText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  criteriaPanel: {
    gap: spacing.xs,
    padding: spacing.s12,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  criteriaHeadline: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  criteriaLine: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 19,
  },
  criteriaEmphasis: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  criteriaFootnote: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    marginTop: spacing.xxs,
  },
  selectorWrap: {
    gap: spacing.s12,
  },
  pathBlock: {
    gap: spacing.xxl,
  },
  pathLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  pathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  pathItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  pathChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  pathChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  pathChipActive: {
    // 선택 = 브랜드 솔리드 + 흰 글씨 고정 짝 (오너 2026-09-18: 검은 알약을 보라로 통일 — SegmentSwitch와 같은 언어).
    backgroundColor: fixedColors.brand,
  },
  pathChipText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  pathChipTextActive: {
    color: fixedColors.white,
  },
  pathArrow: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  pathRootText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  myRegionBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  // 활성 경로 칩이 검정에서 보라로 바뀌면서(2026-09-18) 반투명 흰 워시는 못 쓴다 — 검정 위에선
  // 10:1이던 10px 흰 글씨가 보라 위에선 3.4:1로 떨어지고 배지 윤곽도 칩에 녹는다.
  // 선택 짝을 뒤집어 흰 바탕 + 브랜드 글씨(4.57:1)로 세운다.
  myRegionBadgeActive: {
    backgroundColor: fixedColors.white,
  },
  myRegionBadgeText: {
    color: colors.successText,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  myRegionBadgeTextActive: {
    color: fixedColors.brand,
  },
  regionGrid: {
    gap: spacing.s10,
  },
  regionGridRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  regionCard: {
    // 고정 47%는 남는 폭이 전부 오른쪽에 몰려 좌우 여백이 비대칭이었다 —
    // flex 균등 분할로 행을 꽉 채워 좌우 간격을 맞춘다.
    flex: 1,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.md,
    padding: spacing.s12,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
    minHeight: 92,
    position: 'relative',
  },
  regionCardMy: {
    backgroundColor: colors.successCardSoft,
    borderColor: colors.successCardBorder,
  },
  regionCardSpacer: {
    flex: 1,
  },
  rankBadge: {
    position: 'absolute',
    top: spacing.s10,
    left: spacing.s10,
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  rankBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  regionMyBadge: {
    position: 'absolute',
    top: spacing.s10,
    right: spacing.s10,
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  regionMyBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  regionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 26,
  },
  regionName: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  regionMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
