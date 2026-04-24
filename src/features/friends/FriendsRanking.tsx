import { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { FriendRank } from '@/domain/types';

type FriendsRankingProps = {
  ranks: FriendRank[];
  highlightTag?: string;
};

export function FriendsRanking({ ranks, highlightTag }: FriendsRankingProps) {
  if (ranks.length === 0) {
    return null;
  }

  const [rankingWindow, setRankingWindow] = useState<'today' | 'week' | 'month'>('week');
  const sortedRanks = useMemo(() => [...ranks].sort((left, right) => left.rank - right.rank), [ranks]);
  const displayedRanks = useMemo(() => {
    const transformed = sortedRanks.map((runner, index) => {
      if (rankingWindow === 'today') {
        return {
          ...runner,
          distanceKm: Number((runner.distanceKm / 7 + (sortedRanks.length - index) * 0.2).toFixed(1)),
          points: Math.max(1, Math.round(runner.points / 7 + (sortedRanks.length - index))),
        };
      }

      if (rankingWindow === 'month') {
        return {
          ...runner,
          distanceKm: Number((runner.distanceKm * 4.2).toFixed(1)),
          points: Math.round(runner.points * 4.1),
        };
      }

      return runner;
    });

    return transformed
      .sort((left, right) => {
        if (right.distanceKm !== left.distanceKm) {
          return right.distanceKm - left.distanceKm;
        }

        if (right.points !== left.points) {
          return right.points - left.points;
        }

        return left.name.localeCompare(right.name, 'ko');
      })
      .map((runner, index) => ({
        ...runner,
        rank: index + 1,
      }));
  }, [rankingWindow, sortedRanks]);
  const myRank = highlightTag ? displayedRanks.find((runner) => runner.tag === highlightTag) : null;
  const rankingWindowLabel = rankingWindow === 'today' ? '오늘' : rankingWindow === 'month' ? '이번 달' : '이번 주';

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>친구 경쟁 순위표</Text>
          <Text style={styles.subtitle}>가장 많이 뛰고, 가장 높은 포인트를 쌓은 친구가 위로 올라갑니다.</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{displayedRanks.length}명</Text>
        </View>
      </View>

      <View style={styles.modeSwitch}>
        <Pressable
          style={[styles.modeButton, rankingWindow === 'today' && styles.modeButtonActive]}
          onPress={() => setRankingWindow('today')}
        >
          <Text style={[styles.modeButtonText, rankingWindow === 'today' && styles.modeButtonTextActive]}>오늘 랭킹</Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, rankingWindow === 'week' && styles.modeButtonActive]}
          onPress={() => setRankingWindow('week')}
        >
          <Text style={[styles.modeButtonText, rankingWindow === 'week' && styles.modeButtonTextActive]}>이번 주 랭킹</Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, rankingWindow === 'month' && styles.modeButtonActive]}
          onPress={() => setRankingWindow('month')}
        >
          <Text style={[styles.modeButtonText, rankingWindow === 'month' && styles.modeButtonTextActive]}>이번 달 랭킹</Text>
        </Pressable>
      </View>

      {myRank ? (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{rankingWindowLabel} 내 순위</Text>
            <Text style={styles.summaryValue}>{myRank.rank}위</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{rankingWindowLabel} 내 거리</Text>
            <Text style={styles.summaryValue}>{myRank.distanceKm}km</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.rankList}>
        {displayedRanks.map((runner) => {
          const isMine = runner.tag === highlightTag;

          return (
            <Link key={runner.id} href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild>
              <Pressable style={[styles.rankCard, isMine ? styles.myCard : null]}>
                <View style={styles.rankRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>{runner.rank}위</Text>
                  </View>

                  <View style={styles.runnerMeta}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.runnerName}>
                        {runner.name}
                      </Text>
                      {isMine ? (
                        <View style={styles.selfBadge}>
                          <Text style={styles.selfBadgeText}>나</Text>
                        </View>
                      ) : null}
                      {runner.isRunningNow ? (
                        <View style={styles.livePill}>
                          <View style={styles.livePillDot} />
                          <Text style={styles.livePillText}>러닝 중</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.metricInline}>
                    <Text style={styles.metricInlineValue}>{runner.distanceKm}km</Text>
                  </View>

                  <View style={styles.metricInline}>
                    <Text style={styles.metricInlineValue}>{runner.points}P</Text>
                  </View>
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    includeFontPadding: false,
  },
  subtitle: {
    color: '#D0D5DD',
    lineHeight: 20,
    includeFontPadding: false,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modeButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#374151',
  },
  modeButtonText: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#1F2937',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryItem: {
    flex: 1,
    gap: 3,
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#374151',
    marginHorizontal: 12,
  },
  summaryLabel: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
  },
  rankList: {
    gap: 10,
  },
  rankCard: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  myCard: {
    borderColor: '#6172F3',
    backgroundColor: '#22304B',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    minWidth: 52,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    includeFontPadding: false,
  },
  runnerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  runnerName: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    includeFontPadding: false,
  },
  selfBadge: {
    backgroundColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  selfBadgeText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#123524',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  livePillDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#32D583',
  },
  livePillText: {
    color: '#D1FADF',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  metricInline: {
    width: 72,
    alignItems: 'flex-end',
  },
  metricInlineValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    includeFontPadding: false,
  },
});
