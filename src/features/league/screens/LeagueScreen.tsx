import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, type LayoutChangeEvent } from 'react-native';

import { Screen } from '@/components/Screen';
import { PageHeader } from '@/components/ui/PageHeader';
import { StateMessageCard } from '@/components/ui/StateMessageCard';
import { DistrictMemberRankingCard } from '@/features/league/components/DistrictMemberRankingCard';
import { LeagueHeroCard } from '@/features/league/components/LeagueHeroCard';
import { LeagueModeSwitch } from '@/features/league/components/LeagueModeSwitch';
import { LeagueRegionSelectorCard } from '@/features/league/components/LeagueRegionSelectorCard';
import { TodayRankingCard } from '@/features/league/components/TodayRankingCard';
import { useRegionLeagueState } from '@/features/league/hooks/useRegionLeagueState';
import { colors } from '@/theme/tokens';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';

export default function LeagueScreen() {
  useTabWarmupTrace('league');
  const scrollRef = useRef<ScrollView | null>(null);
  const [memberRankCardY, setMemberRankCardY] = useState(0);
  const [myRankRowY, setMyRankRowY] = useState<number | null>(null);
  const {
    leagueMode,
    setLeagueMode,
    currentNode,
    breadcrumbNodes,
    visibleChildren,
    isTodayView,
    isLeafRegion,
    loading,
    error,
    regionMembers,
    regionMembersLoading,
    regionMembersError,
    loadLeague,
    loadRegionMembers,
    isCurrentUserRegionNode,
  } = useRegionLeagueState();

  useEffect(() => {
    setMyRankRowY(null);
  }, [currentNode?.id]);

  const currentNodeId = currentNode?.id;

  const scrollToMyRank = useCallback(() => {
    if (myRankRowY === null) {
      return;
    }

    scrollRef.current?.scrollTo({
      y: Math.max(0, memberRankCardY + myRankRowY - 180),
      animated: true,
    });
  }, [memberRankCardY, myRankRowY]);
  const handleRetryLeague = useCallback(() => {
    loadLeague(currentNodeId);
  }, [currentNodeId, loadLeague]);
  const handleRetryInitialLeague = useCallback(() => {
    loadLeague();
  }, [loadLeague]);
  const handleRetryRegionMembers = useCallback(() => {
    if (currentNodeId) {
      loadRegionMembers(currentNodeId);
    }
  }, [currentNodeId, loadRegionMembers]);
  const handleMemberRankCardLayout = useCallback((event: LayoutChangeEvent) => {
    setMemberRankCardY(event.nativeEvent.layout.y);
  }, []);
  const handleMyRankLayout = useCallback((event: LayoutChangeEvent) => {
    setMyRankRowY(event.nativeEvent.layout.y);
  }, []);

  return (
    <Screen scrollRef={scrollRef}>
      <PageHeader title="랭킹" />

      <LeagueModeSwitch mode={leagueMode} onChange={setLeagueMode} />

      {isTodayView ? (
        <TodayRankingCard />
      ) : (
        <>
          {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

          {!loading && error ? (
            <StateMessageCard
              title="지역 랭킹을 아직 못 불러왔어"
              message={error}
              tone="danger"
              actionLabel="다시 불러오기"
              onAction={handleRetryLeague}
            />
          ) : null}

          {!loading && !error && !currentNode ? (
            <StateMessageCard
              title="지역 랭킹 데이터가 아직 없어"
              message="백엔드 응답이 연결되면 지역별 순위를 바로 탐색할 수 있어."
              actionLabel="다시 불러오기"
              onAction={handleRetryInitialLeague}
            />
          ) : null}

          {currentNode ? (
            <>
              <LeagueHeroCard node={currentNode} isMyRegion={isCurrentUserRegionNode(currentNode)} />
              <LeagueRegionSelectorCard
                breadcrumbNodes={breadcrumbNodes}
                visibleChildren={visibleChildren}
                isMyRegionNode={isCurrentUserRegionNode}
                onSelectRegion={loadLeague}
              />

              {isLeafRegion ? (
                <>
                  {regionMembersLoading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

                  {!regionMembersLoading && regionMembersError ? (
                    <StateMessageCard
                      title="회원 순위를 아직 못 불러왔어"
                      message={regionMembersError}
                      tone="danger"
                      actionLabel="다시 불러오기"
                      onAction={handleRetryRegionMembers}
                    />
                  ) : null}

                  {!regionMembersLoading && !regionMembersError && regionMembers ? (
                    <DistrictMemberRankingCard
                      regionMembers={regionMembers}
                      onCardLayout={handleMemberRankCardLayout}
                      onMyRankLayout={handleMyRankLayout}
                      onScrollToMyRank={scrollToMyRank}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
