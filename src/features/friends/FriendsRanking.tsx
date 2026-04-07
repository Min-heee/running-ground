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

  const sortedRanks = [...ranks].sort((left, right) => left.rank - right.rank);
  const myRank = highlightTag ? sortedRanks.find((runner) => runner.tag === highlightTag) : null;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>이번 주 메인 랭킹</Text>
          <Text style={styles.title}>친구 순위표</Text>
          <Text style={styles.subtitle}>친구들과 거리와 포인트를 같은 규격으로 비교할 수 있어.</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{sortedRanks.length}명</Text>
        </View>
      </View>

      {myRank ? (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>내 순위</Text>
            <Text style={styles.summaryValue}>{myRank.rank}위</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>내 거리</Text>
            <Text style={styles.summaryValue}>{myRank.distanceKm}km</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.rankList}>
        {sortedRanks.map((runner) => {
          const isMine = runner.tag === highlightTag;

          return (
            <Link key={runner.id} href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild>
              <Pressable style={[styles.rankCard, isMine ? styles.myCard : null]}>
                <View style={styles.rankHeader}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>{runner.rank}</Text>
                  </View>

                  <View style={styles.runnerMeta}>
                    <View style={styles.nameRow}>
                      <Text style={styles.runnerName}>{runner.name}</Text>
                      {isMine ? (
                        <View style={styles.selfBadge}>
                          <Text style={styles.selfBadgeText}>나</Text>
                        </View>
                      ) : null}
                    </View>
                    {runner.tag ? <Text style={styles.runnerTag}>{runner.tag}</Text> : null}
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>거리</Text>
                    <Text style={styles.metricValue}>{runner.distanceKm}km</Text>
                  </View>

                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>포인트</Text>
                    <Text style={styles.metricValue}>{runner.points}P</Text>
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
    backgroundColor: '#F8FAFC',
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
  eyebrow: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  title: {
    color: '#101828',
    fontSize: 28,
    fontWeight: '800',
    includeFontPadding: false,
  },
  subtitle: {
    color: '#475467',
    lineHeight: 20,
    includeFontPadding: false,
  },
  countBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countBadgeText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EAECF0',
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
    backgroundColor: '#EAECF0',
    marginHorizontal: 12,
  },
  summaryLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  summaryValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
  },
  rankList: {
    gap: 10,
  },
  rankCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 16,
    gap: 14,
    minHeight: 132,
  },
  myCard: {
    borderColor: '#C7D2FE',
    backgroundColor: '#F8F9FF',
  },
  rankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    includeFontPadding: false,
  },
  runnerMeta: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  runnerName: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
  },
  runnerTag: {
    color: '#667085',
    fontWeight: '600',
    includeFontPadding: false,
  },
  selfBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selfBadgeText: {
    color: '#4338CA',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
  },
  metricValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
    marginTop: 4,
  },
});
