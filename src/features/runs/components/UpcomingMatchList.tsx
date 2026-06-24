import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldShowMatchCardCountdown,
} from '@/lib/matchCountdown';
import { resolveUpcomingMatchInteraction } from '@/features/runs/components/upcomingMatchInteraction';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// A matched 1:1 (duel) opens the full-screen reservation waiting room (modeled on
// the party room). The room itself renders the countdown + hands off to the arena
// auto-open at the slot — so tapping the card before the arena window is valid.
function openDuelReservationRoom(match: UpcomingRunningMatchItem) {
  router.push({
    pathname: '/duel-reservation',
    params: {
      matchId: match.matchId,
      distanceKm: String(match.distanceKm),
      slotStartAt: match.slotStartAt,
      isTestMatch: match.isTestMatch ? '1' : '0',
    },
  });
}

// A matched (matchmade) group opens its own reservation waiting room, the group
// analog of the duel room — same countdown + arena auto-open handoff, but listing
// the whole roster instead of a 나/상대 pair.
function openGroupReservationRoom(match: UpcomingRunningMatchItem) {
  router.push({
    pathname: '/group-reservation',
    params: {
      matchId: match.matchId,
      distanceKm: String(match.distanceKm),
      slotStartAt: match.slotStartAt,
      participantCount: String(match.participantCount),
      isTestMatch: match.isTestMatch ? '1' : '0',
    },
  });
}

type UpcomingMatchListProps = {
  matches: UpcomingRunningMatchItem[];
  nowMs: number;
  cancelingMatchId: string | null;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
};

const UpcomingMatchRow = memo(function UpcomingMatchRow({
  match,
  nowMs,
  cancelingMatchId,
  onOpenMatch,
  onCancelMatch,
}: {
  match: UpcomingRunningMatchItem;
  nowMs: number;
  cancelingMatchId: string | null;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
}) {
  const remainingSeconds = getMatchStartRemainingSeconds(match.slotStartAt, nowMs);
  const { canOpenArena, opensReservationRoom, reservationRoomMode, isTappable } = resolveUpcomingMatchInteraction(
    match,
    remainingSeconds,
  );

  const handleOpenMatch = useCallback(() => {
    if (opensReservationRoom) {
      if (reservationRoomMode === 'group') {
        openGroupReservationRoom(match);
      } else {
        openDuelReservationRoom(match);
      }
      return;
    }

    if (!canOpenArena) {
      return;
    }

    onOpenMatch(match);
  }, [canOpenArena, match, onOpenMatch, opensReservationRoom, reservationRoomMode]);

  const handleCancelMatch = useCallback(() => {
    onCancelMatch(match);
  }, [match, onCancelMatch]);

  return (
    <Pressable
      style={styles.row}
      disabled={!isTappable}
      onPress={handleOpenMatch}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>
          {match.isTestMatch ? '테스트 ' : ''}{match.mode === 'duel' ? '1대1 대결' : '그룹 대결'} · {match.summary}
        </Text>
        <Text style={styles.meta}>{match.counterpartLabel}</Text>
        {shouldShowMatchCardCountdown(remainingSeconds) ? (
          <View style={styles.countdownPill}>
            <Text style={styles.countdownText}>시작까지 {formatMatchCountdown(remainingSeconds!)}</Text>
          </View>
        ) : null}
        {match.status === 'matched' ? (
          match.canCancel ? (
            <Pressable
              style={styles.cancelButton}
              onPress={handleCancelMatch}
            >
              <Text style={styles.cancelText}>
                {cancelingMatchId === match.matchId ? '취소 중...' : '예약 취소'}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.helperText}>출발 1시간 전부터는 취소할 수 없어요.</Text>
          )
        ) : null}
        {canOpenArena ? (
          <Text style={styles.helperText}>누르면 바로 대결 보기로 이동해요.</Text>
        ) : opensReservationRoom ? (
          <Text style={styles.helperText}>누르면 예약 대기실로 이동해요.</Text>
        ) : null}
      </View>
      <Text style={styles.state}>
        {match.status === 'active' ? '진행 중' : canOpenArena ? '곧 시작' : '예약됨'}
      </Text>
    </Pressable>
  );
});

export function UpcomingMatchList({
  matches,
  nowMs,
  cancelingMatchId,
  onOpenMatch,
  onCancelMatch,
}: UpcomingMatchListProps) {
  const visibleMatchRows = useMemo(() => (
    matches.slice(0, 2).map((match) => (
      <UpcomingMatchRow
        key={match.matchId}
        match={match}
        nowMs={nowMs}
        cancelingMatchId={cancelingMatchId}
        onOpenMatch={onOpenMatch}
        onCancelMatch={onCancelMatch}
      />
    ))
  ), [cancelingMatchId, matches, nowMs, onCancelMatch, onOpenMatch]);

  if (!matches.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>다가오는 매치</Text>
      {visibleMatchRows}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s10,
    padding: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.s10,
  },
  copy: {
    flex: 1,
    gap: spacing.sm,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  meta: {
    color: colors.border,
    lineHeight: 18,
  },
  countdownPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.32)',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  countdownText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  cancelButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  helperText: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  state: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
