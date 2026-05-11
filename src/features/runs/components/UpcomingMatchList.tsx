import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatMatchCountdown,
  getMatchStartRemainingSeconds,
  shouldAutoOpenMatchArena,
  shouldShowMatchCardCountdown,
} from '@/lib/matchCountdown';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';

type UpcomingMatchListProps = {
  matches: UpcomingRunningMatchItem[];
  nowMs: number;
  cancelingMatchId: string | null;
  onOpenMatch: (match: UpcomingRunningMatchItem) => void;
  onCancelMatch: (match: UpcomingRunningMatchItem) => void;
};

export function UpcomingMatchList({
  matches,
  nowMs,
  cancelingMatchId,
  onOpenMatch,
  onCancelMatch,
}: UpcomingMatchListProps) {
  if (!matches.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>다가오는 매치</Text>
      {matches.slice(0, 2).map((match) => {
        const remainingSeconds = getMatchStartRemainingSeconds(match.slotStartAt, nowMs);
        const canOpenArena = match.status === 'active'
          || (match.status === 'matched' && shouldAutoOpenMatchArena(remainingSeconds));

        return (
          <Pressable
            key={match.matchId}
            style={styles.row}
            disabled={!canOpenArena}
            onPress={() => {
              if (!canOpenArena) {
                return;
              }

              onOpenMatch(match);
            }}
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
                    onPress={() => {
                      onCancelMatch(match);
                    }}
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
  eyebrow: {
    color: '#C7D2FE',
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    color: '#D0D5DD',
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
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  cancelButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  helperText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  state: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
  },
});
