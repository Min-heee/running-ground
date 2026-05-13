import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import {
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchCardCountdown,
} from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

type HomeUpcomingMatchesCardProps = {
  matches: UpcomingRunningMatchItem[];
  nowMs: number;
  cancelingMatchId: string | null;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
};

export function HomeUpcomingMatchesCard({
  matches,
  nowMs,
  cancelingMatchId,
  onCancelMatch,
  onOpenMatch,
}: HomeUpcomingMatchesCardProps) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <Card style={styles.upcomingCard}>
      <Text style={styles.upcomingLabel}>다가오는 대결</Text>
      {matches.slice(0, 2).map((match) => {
        const remainingSeconds = getMatchStartRemainingSeconds(match.slotStartAt, nowMs);
        const canOpenArena = match.status === 'active'
          || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));

        return (
          <Pressable
            key={match.matchId}
            style={styles.upcomingRow}
            disabled={!canOpenArena}
            onPress={() => onOpenMatch(match)}
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
                    onPress={() => onCancelMatch(match)}
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
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  upcomingCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  upcomingLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  upcomingCopy: {
    flex: 1,
    gap: 4,
  },
  upcomingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  upcomingMeta: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  upcomingLinkText: {
    color: '#C7D2FE',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  upcomingCountdownPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(109, 94, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(199, 210, 254, 0.32)',
  },
  upcomingCountdownText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingCancelButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  upcomingCancelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingHelperText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  upcomingState: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
  },
});
