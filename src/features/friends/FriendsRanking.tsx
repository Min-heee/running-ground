import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
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
  // 친구 탭은 5명까지만 보이고 '더보기'가 전체 순위표 페이지(/friend-ranking)로 보낸다
  // (오너 2026-09-18). 페이지 쪽은 limit 없이 전부 그린다. 내 순위·내 거리는 위 요약바가
  // 늘 보여주므로 내가 6위 밖이어도 잘리는 건 줄 하나뿐이다.
  limit?: number;
  onShowMore?: () => void;
};

export const FriendsRanking = memo(function FriendsRanking({
  ranks,
  highlightTag,
  limit,
  onShowMore,
}: FriendsRankingProps) {
  const [rankingWindow, setRankingWindow] = useState<FriendRankingWindow>('week');
  const handleSelectWindow = useCallback((id: string) => {
    setRankingWindow(id as FriendRankingWindow);
  }, []);
  const displayedRanks = useMemo(
    () => buildFriendRankingWindowRanks(ranks, rankingWindow),
    [rankingWindow, ranks],
  );
  const myRank = highlightTag ? displayedRanks.find((runner) => runner.tag === highlightTag) : null;
  const rankingWindowLabel = getFriendRankingWindowLabel(rankingWindow);
  const isTruncated = typeof limit === 'number' && limit > 0 && displayedRanks.length > limit;
  const visibleRanks = isTruncated ? displayedRanks.slice(0, limit) : displayedRanks;

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

      {/* 러닝탭 혼자/매칭/파티런과 같은 공용 세그먼트 (오너 2026-08-04 일괄 통일).
          풀 라벨("이번 주 랭킹")은 아래 요약바가 제공하므로 탭은 간결하게. */}
      <SegmentSwitch
        items={RANKING_WINDOW_ITEMS}
        activeId={rankingWindow}
        onSelect={handleSelectWindow}
        variant="card"
      />

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
        {visibleRanks.map((runner) => (
          <FriendRankRow
            key={runner.id}
            runner={runner}
            isMine={runner.tag === highlightTag}
          />
        ))}
      </View>

      {isTruncated && onShowMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="친구 순위표 전체 보기"
          onPress={onShowMore}
          style={styles.moreButton}
          hitSlop={8}
        >
          {/* 'N명 더' 힌트는 오너가 뺐다 (2026-09-18) — 전체 인원은 위 'N명' 배지가 이미 말한다. */}
          <Text style={styles.moreButtonText}>더보기</Text>
          <Text style={styles.moreButtonChevron}>›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
});

const RANKING_WINDOW_ITEMS = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
] as const;
