import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { RegionDrilldownNode } from '@/domain';
import type { RegionBreadcrumbItem } from '@/lib/api/types';
import { PodiumBadge } from '@/features/league/components/LeagueRankBadges';
import { getPodiumTheme } from '@/features/league/utils/leagueRanking';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatDistanceKm, formatPeopleCount } from '@/utils/formatUnits';

type LeagueRegionSelectorCardProps = {
  breadcrumbNodes: RegionBreadcrumbItem[];
  visibleChildren: RegionDrilldownNode[];
  isMyRegionNode: (node: Pick<RegionDrilldownNode, 'level' | 'name'>) => boolean;
  onSelectRegion: (nodeId?: string) => void;
};

type RegionNodeIdentity = Pick<RegionDrilldownNode, 'level' | 'name'>;

export const LeagueRegionSelectorCard = memo(function LeagueRegionSelectorCard({
  breadcrumbNodes,
  visibleChildren,
  isMyRegionNode,
  onSelectRegion,
}: LeagueRegionSelectorCardProps) {
  return (
    <Card>
      <SectionTitle>지역 선택</SectionTitle>
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
            ) : null}
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
      <Text style={styles.regionName}>{node.name}</Text>
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
    backgroundColor: colors.inkPill,
  },
  pathChipText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  pathChipTextActive: {
    color: colors.white,
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
  myRegionBadgeActive: {
    backgroundColor: colors.translucentWhite18,
  },
  myRegionBadgeText: {
    color: colors.successText,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  myRegionBadgeTextActive: {
    color: colors.white,
  },
  regionGrid: {
    gap: spacing.s10,
  },
  regionGridRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  regionCard: {
    width: '47%',
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
  regionName: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
    marginTop: 26,
  },
  regionMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
