import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import {
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchCardCountdown,
} from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomeUpcomingMatchesCardProps = {
  matches: UpcomingRunningMatchItem[];
  nowMs: number;
  cancelingMatchId: string | null;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
};

const HomeUpcomingMatchRow = memo(function HomeUpcomingMatchRow({
  cancelingMatchId,
  match,
  nowMs,
  onCancelMatch,
  onOpenMatch,
}: {
  cancelingMatchId: string | null;
  match: UpcomingRunningMatchItem;
  nowMs: number;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
}) {
  const remainingSeconds = getMatchStartRemainingSeconds(match.slotStartAt, nowMs);
  const canOpenArena = match.status === 'active'
    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));
  const handleOpenMatch = useCallback(() => onOpenMatch(match), [match, onOpenMatch]);
  const handleCancelMatch = useCallback(() => onCancelMatch(match), [match, onCancelMatch]);

  return (
    <Pressable
      style={styles.upcomingRow}
      disabled={!canOpenArena}
      onPress={handleOpenMatch}
    >
      <View style={styles.upcomingCopy}>
        <Text style={styles.upcomingTitle}>
          {match.isTestMatch ? '테스트 ' : ''}{match.mode === 'duel' ? '1대1 대결' : '그룹 대결'} · {match.summary}
        </Text>
        <Text style={styles.upcomingMeta}>{match.counterpartLabel}</Text>
        {shouldShowMatchCardCountdown(remainingSeconds) ? (
          <View style={styles.upcomingCountdownPill}>
            <Text style={styles.upcomingCountdownText}>시작까지 {formatMatchCountdown(remainingSeconds!)}</Text>
          </View>
        ) : null}
        {match.status === 'matched' ? (
          match.canCancel ? (
            <Pressable
              style={styles.upcomingCancelButton}
              onPress={handleCancelMatch}
            >
              <Text style={styles.upcomingCancelText}>
                {cancelingMatchId === match.matchId ? '취소 중...' : '예약 취소'}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.upcomingHelperText}>출발 1시간 전부터는 취소할 수 없어요.</Text>
          )
        ) : null}
        {canOpenArena ? (
          <Text style={styles.upcomingLinkText}>누르면 바로 대결 보기로 이동해요</Text>
        ) : null}
      </View>
      <Text style={styles.upcomingState}>
        {match.status === 'active' ? '진행 중' : canOpenArena ? '곧 시작' : '예약됨'}
      </Text>
    </Pressable>
  );
});

function HomeUpcomingMatchesCardImpl({
  matches,
  nowMs,
  cancelingMatchId,
  onCancelMatch,
  onOpenMatch,
}: HomeUpcomingMatchesCardProps) {
  const upcomingMatchRows = useMemo(() => matches.slice(0, 2).map((match) => (
    <HomeUpcomingMatchRow
      key={match.matchId}
      cancelingMatchId={cancelingMatchId}
      match={match}
      nowMs={nowMs}
      onCancelMatch={onCancelMatch}
      onOpenMatch={onOpenMatch}
    />
  )), [cancelingMatchId, matches, nowMs, onCancelMatch, onOpenMatch]);

  if (matches.length === 0) {
    return null;
  }

  return (
    <Card style={styles.upcomingCard}>
      <Text style={styles.upcomingLabel}>다가오는 대결</Text>
      {upcomingMatchRows}
    </Card>
  );
}

export const HomeUpcomingMatchesCard = memo(HomeUpcomingMatchesCardImpl);

const styles = StyleSheet.create({
  upcomingCard: {
    backgroundColor: colors.textPrimary,
    gap: spacing.s10,
  },
  upcomingLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.s10,
  },
  upcomingCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  upcomingTitle: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  upcomingMeta: {
    color: colors.border,
    lineHeight: 19,
  },
  upcomingLinkText: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  upcomingCountdownPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(109, 94, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(199, 210, 254, 0.32)',
  },
  upcomingCountdownText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  upcomingCancelButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.darkMuted,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  upcomingCancelText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  upcomingHelperText: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  upcomingState: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
