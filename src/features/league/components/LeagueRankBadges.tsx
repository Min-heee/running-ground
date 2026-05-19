import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { getPodiumTheme } from '@/features/league/utils/leagueRanking';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export function PodiumBadge({ rank, compact = false }: { rank: number; compact?: boolean }) {
  const theme = getPodiumTheme(rank);

  if (!theme) {
    return null;
  }

  return (
    <View
      style={[
        styles.podiumBadge,
        compact && styles.podiumBadgeCompact,
        {
          backgroundColor: theme.backgroundColor,
          borderColor: theme.borderColor,
        },
      ]}
    >
      <MaterialCommunityIcons name="crown" size={compact ? 12 : 14} color={theme.iconColor} />
      <Text style={[styles.podiumBadgeText, compact && styles.podiumBadgeTextCompact, { color: theme.textColor }]}>
        {rank}위
      </Text>
    </View>
  );
}

export function RankMarker({ rank }: { rank: number }) {
  const theme = getPodiumTheme(rank);

  if (!theme) {
    return <Text style={styles.rankNumber}>{rank}</Text>;
  }

  return (
    <View style={[styles.rankMarkerPodium, { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor }]}>
      <MaterialCommunityIcons name="crown" size={13} color={theme.iconColor} />
      <Text style={[styles.rankMarkerPodiumText, { color: theme.textColor }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  podiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: spacing.lg,
    borderWidth: 1,
  },
  podiumBadgeCompact: {
    position: 'absolute',
    top: spacing.s10,
    left: spacing.s10,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  podiumBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  podiumBadgeTextCompact: {
    fontSize: fontSizes.xs,
  },
  rankNumber: {
    width: 24,
    textAlign: 'center',
    fontWeight: fontWeights.extraBold,
    color: colors.textStrongMuted,
  },
  rankMarkerPodium: {
    minWidth: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxxs,
  },
  rankMarkerPodiumText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
    includeFontPadding: false,
  },
});
