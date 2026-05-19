import { useCallback, useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/services/apiError';
import { fetchDistrictPersonal, fetchRegionLeague } from '@/services/leagueService';
import type { DistrictPersonalResponse, RegionLeagueResponse } from '@/lib/api/types';
import { getCurrentUserProfile } from '@/lib/session';
import type { LeagueMode, LeagueRegionNodeIdentity } from '@/features/league/types/league';
import { isMyRegionNode, sortRegionChildrenByRank } from '@/features/league/utils/leagueRanking';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const EMPTY_REGION_CHILDREN: NonNullable<RegionLeagueResponse['children']> = [];
const LEAGUE_INITIAL_FETCH_DEFER_MS = 120;
const LEAGUE_MEMBER_FETCH_DEFER_MS = 160;

export function useRegionLeagueState() {
  const [leagueMode, setLeagueMode] = useState<LeagueMode>('region');
  const [league, setLeague] = useState<RegionLeagueResponse | null>(null);
  const [regionMembers, setRegionMembers] = useState<DistrictPersonalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionMembersLoading, setRegionMembersLoading] = useState(false);
  const [regionMembersError, setRegionMembersError] = useState<string | null>(null);

  const profile = useMemo(() => getCurrentUserProfile(), []);
  const currentNode = league?.currentNode ?? null;
  const children = league?.children ?? EMPTY_REGION_CHILDREN;
  const breadcrumbNodes = useMemo(() => league?.breadcrumb ?? [], [league]);
  const visibleChildren = useMemo(() => sortRegionChildrenByRank(children), [children]);
  const isTodayView = leagueMode === 'today';
  const isLeafRegion = !isTodayView && Boolean(currentNode) && children.length === 0;

  const loadLeague = useCallback((nodeId?: string) => {
    setLoading(true);
    setError(null);

    fetchRegionLeague(nodeId)
      .then((response) => {
        setLeague(response);
      })
      .catch((loadError) => setError(getApiErrorMessage(loadError, '지역 랭킹 정보를 불러오지 못했어.')))
      .finally(() => setLoading(false));
  }, []);

  const loadRegionMembers = useCallback((nodeId: string) => {
    setRegionMembersLoading(true);
    setRegionMembersError(null);

    fetchDistrictPersonal(nodeId)
      .then((response) => setRegionMembers(response))
      .catch((loadError) => setRegionMembersError(getApiErrorMessage(loadError, '이 지역 회원 순위를 불러오지 못했어.')))
      .finally(() => setRegionMembersLoading(false));
  }, []);

  const isCurrentUserRegionNode = useCallback(
    (node: LeagueRegionNodeIdentity) => isMyRegionNode(node, profile),
    [profile],
  );

  useAndroidDeferredEffect(() => {
    loadLeague();
  }, [loadLeague], {
    delayMs: LEAGUE_INITIAL_FETCH_DEFER_MS,
    source: 'league screen model',
    tab: 'league',
    traceInitialFetch: true,
    work: 'region league fetch',
  });

  useAndroidDeferredEffect(() => {
    if (!isLeafRegion || !currentNode) {
      setRegionMembers(null);
      setRegionMembersError(null);
      setRegionMembersLoading(false);
      return;
    }

    loadRegionMembers(currentNode.id);
  }, [currentNode, isLeafRegion, loadRegionMembers], {
    delayMs: LEAGUE_MEMBER_FETCH_DEFER_MS,
    source: 'league screen model',
    tab: 'league',
    traceInitialFetch: true,
    work: 'district member ranking fetch',
  });

  return {
    leagueMode,
    setLeagueMode,
    currentNode,
    children,
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
  };
}
