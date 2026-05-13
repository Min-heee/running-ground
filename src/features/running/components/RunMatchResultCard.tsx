import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { RunDetailResponse } from '@/lib/api/types';

type RunRecord = RunDetailResponse['run'];
type MatchResult = NonNullable<RunRecord['matchResult']>;

type RunMatchResultCardProps = {
  matchResult: MatchResult;
  matchBonusPoints: number;
};

export function RunMatchResultCard({ matchResult, matchBonusPoints }: RunMatchResultCardProps) {
  return (
    <Card style={styles.matchResultCard}>
      <View style={styles.matchResultHeader}>
        <View>
          <Text style={styles.matchResultLabel}>
            {matchResult.mode === 'duel' ? '1대1 대결 결과' : '그룹 대결 결과'}
          </Text>
          <Text style={styles.matchResultTitle}>{matchResult.title}</Text>
        </View>
        <View
          style={[
            styles.matchResultBadge,
            matchResult.resultTone === 'win'
              ? styles.matchResultBadgeWin
              : matchResult.resultTone === 'lose'
                ? styles.matchResultBadgeLose
                : matchResult.resultTone === 'draw'
                  ? styles.matchResultBadgeDraw
                  : null,
          ]}
        >
          <Text style={styles.matchResultBadgeText}>{matchResult.badgeLabel}</Text>
        </View>
      </View>
      <Text style={styles.matchResultSummary}>{matchResult.summary}</Text>
      <View style={styles.matchResultPointPill}>
        <Text style={styles.matchResultPointPillText}>매치 포인트 +{matchBonusPoints}P</Text>
      </View>
      <View style={styles.matchResultMetaRow}>
        {matchResult.opponentName ? (
          <Text style={styles.matchResultMeta}>상대 {matchResult.opponentName}</Text>
        ) : null}
        {typeof matchResult.rank === 'number' && typeof matchResult.participantCount === 'number' ? (
          <Text style={styles.matchResultMeta}>
            {matchResult.participantCount}명 중 {matchResult.rank}위
          </Text>
        ) : null}
        {typeof matchResult.gapKm === 'number' ? (
          <Text style={styles.matchResultMeta}>
            거리 차이 {matchResult.gapKm.toFixed(2)}km
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  matchResultCard: {
    backgroundColor: '#F8F7FF',
    borderWidth: 1,
    borderColor: '#D9D6FE',
    gap: 10,
  },
  matchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchResultLabel: {
    color: '#6D5EF7',
    fontSize: 12,
    fontWeight: '800',
  },
  matchResultTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  matchResultBadge: {
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#111827',
  },
  matchResultBadgeWin: {
    backgroundColor: '#0F9D58',
  },
  matchResultBadgeLose: {
    backgroundColor: '#F97316',
  },
  matchResultBadgeDraw: {
    backgroundColor: '#6B7280',
  },
  matchResultBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  matchResultSummary: {
    color: '#344054',
    fontWeight: '700',
    lineHeight: 20,
  },
  matchResultPointPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  matchResultPointPillText: {
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '800',
  },
  matchResultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchResultMeta: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '700',
  },
});
