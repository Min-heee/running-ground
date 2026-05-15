import { memo } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { FriendRank } from '@/domain';
import { friendsRankingStyles as styles } from './friendsRankingStyles';

type FriendRankRowProps = {
  runner: FriendRank;
  isMine: boolean;
};

export const FriendRankRow = memo(function FriendRankRow({ runner, isMine }: FriendRankRowProps) {
  return (
    <Link href={{ pathname: '/friend-detail', params: { friendId: runner.id } }} asChild>
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
});
