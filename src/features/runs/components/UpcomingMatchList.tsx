import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchCardCountdown,
} from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { colors } from '@/theme/tokens';

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
  const canOpenArena = match.status === 'active'
    || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));

  const handleOpenMatch = useCallback(() => {
    if (!canOpenArena) {
      return;
    }

    onOpenMatch(match);
  }, [canOpenArena, match, onOpenMatch]);

  const handleCancelMatch = useCallback(() => {
    onCancelMatch(match);
  }, [match, onCancelMatch]);

  return (
    <Pressable
      style={styles.row}
      disabled={!canOpenArena}
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
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    color: colors.border,
    lineHeight: 18,
  },
  countdownPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countdownText: {
    color: colors.brandWashStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  cancelButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  helperText: {
    color: colors.brandTint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  state: {
    color: colors.brandTint,
    fontSize: 12,
    fontWeight: '800',
  },
});
