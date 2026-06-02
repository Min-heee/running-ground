import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { FriendRank } from '@/domain/types';
import { colors } from '@/theme';

export function FriendsRanking({ ranks }: { ranks: FriendRank[] }) {
  return (
    <Card>
      <SectionTitle>친구 랭킹</SectionTitle>
      {ranks.map((rank) => (
        <RankRow key={rank.id} rank={rank} />
      ))}
    </Card>
  );
}

const RankRow = memo(function RankRow({ rank }: { rank: FriendRank }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rankNumber}>{rank.rank}</Text>
      <View style={styles.meta}>
        <Text style={styles.name}>{rank.name}</Text>
        {rank.tag ? <Text style={styles.tag}>{rank.tag}</Text> : null}
      </View>
      <View style={styles.metricBox}>
        <Text style={styles.metricValue}>{rank.distanceKm}km</Text>
        <Text style={styles.metricLabel}>거리</Text>
      </View>
      <View style={styles.metricBox}>
        <Text style={styles.metricValue}>{rank.points}P</Text>
        <Text style={styles.metricLabel}>포인트</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rankNumber: {
    width: 24,
    fontWeight: '800',
    color: colors.textBody,
    fontSize: 16,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tag: {
    color: colors.textMuted,
    fontSize: 12,
  },
  metricBox: {
    alignItems: 'flex-end',
    minWidth: 56,
  },
  metricValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
