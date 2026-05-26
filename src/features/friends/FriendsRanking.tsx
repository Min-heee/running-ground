import { memo, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { FriendRank } from '@/domain';
import { FriendRankRow } from './components/FriendRankRow';
import { friendsRankingStyles as styles } from './components/friendsRankingStyles';
import {
  buildFriendRankingWindowRanks,
  getFriendRankingWindowLabel,
  type FriendRankingWindow,
} from './utils/friendRankingWindow';

type FriendsRankingProps = {
  ranks: FriendRank[];
  highlightTag?: string;
};

export const FriendsRanking = memo(function FriendsRanking({ ranks, highlightTag }: FriendsRankingProps) {
  const [rankingWindow, setRankingWindow] = useState<FriendRankingWindow>('week');
  const displayedRanks = useMemo(
    () => buildFriendRankingWindowRanks(ranks, rankingWindow),
    [rankingWindow, ranks],
  );
  const myRank = highlightTag ? displayedRanks.find((runner) => runner.tag === highlightTag) : null;
  const rankingWindowLabel = getFriendRankingWindowLabel(rankingWindow);

  if (ranks.length === 0) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>친구 순위표</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{displayedRanks.length}명</Text>
        </View>
      </View>

      <View style={styles.modeSwitch}>
        <RankingWindowButton
          active={rankingWindow === 'today'}
          label="오늘 랭킹"
          onPress={() => setRankingWindow('today')}
        />
        <RankingWindowButton
          active={rankingWindow === 'week'}
          label="이번 주 랭킹"
          onPress={() => setRankingWindow('week')}
        />
        <RankingWindowButton
          active={rankingWindow === 'month'}
          label="이번 달 랭킹"
          onPress={() => setRankingWindow('month')}
        />
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
        {displayedRanks.map((runner) => (
          <FriendRankRow
            key={runner.id}
            runner={runner}
            isMine={runner.tag === highlightTag}
          />
        ))}
      </View>
    </Card>
  );
});

function RankingWindowButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.modeButton, active && styles.modeButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}
