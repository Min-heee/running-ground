import { Fragment, memo, useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
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
};

export const FriendsRanking = memo(function FriendsRanking({ ranks, highlightTag }: FriendsRankingProps) {
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
        {/* 줄 사이 구분선 — 아래 친구 카드와 같은 리스트 결 (오너 2026-08-06). */}
        {displayedRanks.map((runner, index) => (
          <Fragment key={runner.id}>
            {index > 0 ? <View style={styles.rankDivider} /> : null}
            <FriendRankRow
              runner={runner}
              isMine={runner.tag === highlightTag}
            />
          </Fragment>
        ))}
      </View>
    </Card>
  );
});

const RANKING_WINDOW_ITEMS = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
] as const;
