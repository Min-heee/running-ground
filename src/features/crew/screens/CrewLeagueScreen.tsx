import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import type { CrewLeagueResponse } from '@/lib/api/types/crew';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';
import { CrewSectionHeader, CrewStandingListRow } from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import {
  buildCrewSeasonProgressLabel,
  formatCrewUnrankedShort,
  isCrewFirstSeason,
  shiftCrewSeasonKey,
} from '../crewModel';
import { useCrewLeague } from '../hooks/useCrewLeague';

// 크루대전 전체 순위 (오너 2026-09-18). 순위에 오른 크루 전부(공동 순위는 같은 숫자) → '순위 밖'
// 크루와 한 단어 사유. 탭의 순위 카드가 5개까지만 보여주고 '전체 순위 ›'가 여기로 민다. 지난 시즌은
// 봉인 원장 스냅샷(상위 10개)이라 순위 밖 목록이 없다. 점수 설명은 오너 2026-09-18에 여기서 빼
// 크루 탭 '순위 기준 ›' 페이지(CrewRulesScreen)로 옮겼다.

type LeagueSegment = 'current' | 'last';

const LEAGUE_SEGMENT_ITEMS: readonly { id: LeagueSegment; label: string }[] = [
  { id: 'current', label: '이번 시즌' },
  { id: 'last', label: '지난 시즌' },
];

export default function CrewLeagueScreen() {
  const [segment, setSegment] = useState<LeagueSegment>('current');
  const current = useCrewLeague(undefined, true);
  const currentLeague = current.state.status === 'ready' ? current.state.league : null;
  // 지난 시즌 키는 이번 시즌 응답에서 한 달 앞 — 이번 시즌을 받기 전엔 부르지 않는다.
  const previousSeasonKey = currentLeague ? shiftCrewSeasonKey(currentLeague.season.seasonKey, -1) : null;
  const last = useCrewLeague(previousSeasonKey, segment === 'last');
  const handleSelectSegment = useCallback((id: string) => setSegment(id as LeagueSegment), []);
  const active = segment === 'current' ? current : last;

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="전체 순위" />

      <SegmentSwitch items={LEAGUE_SEGMENT_ITEMS} activeId={segment} onSelect={handleSelectSegment} />

      {active.state.status === 'idle' || active.state.status === 'loading' ? (
        <ActivityIndicator size="large" color={colors.brand} />
      ) : null}

      {active.state.status === 'error' ? (
        <Card>
          <Text style={crewListStyles.errorText}>{active.state.message}</Text>
          <PrimaryButton label="다시 불러오기" onPress={active.reload} />
        </Card>
      ) : null}

      {active.state.status === 'missing' ? (
        <Text style={styles.empty}>
          {segment === 'last' && currentLeague && isCrewFirstSeason(currentLeague.season)
            ? `${currentLeague.season.label}이 첫 시즌이에요. 지난 시즌 결과는 다음 달부터 볼 수 있어요.`
            : '이 시즌 기록이 없어요.'}
        </Text>
      ) : null}

      {active.state.status === 'ready' ? (
        <LeagueBody
          league={active.state.league}
          showUnranked={segment === 'current'}
          firstSeasonLabel={segment === 'last' && currentLeague && isCrewFirstSeason(currentLeague.season)
            ? currentLeague.season.label
            : null}
        />
      ) : null}
    </Screen>
  );
}

function LeagueBody({
  league,
  showUnranked,
  firstSeasonLabel,
}: {
  league: CrewLeagueResponse;
  showUnranked: boolean;
  firstSeasonLabel: string | null;
}) {
  const unranked = showUnranked ? league.unranked : [];

  return (
    <>
      <View style={crewListStyles.section}>
        <CrewSectionHeader
          title={league.season.label}
          meta={league.sealed ? '확정' : buildCrewSeasonProgressLabel(league.season)}
        />
        {league.ranked.length > 0 ? (
          <Card style={crewListStyles.rowsCard}>
            {league.ranked.map((row, index) => (
              <CrewStandingListRow
                key={row.crewId}
                row={row}
                isFirst={index === 0}
                meta={`${row.seasonMemberCount}명`}
              />
            ))}
          </Card>
        ) : (
          <Text style={styles.empty}>
            {firstSeasonLabel
              ? `${firstSeasonLabel}이 첫 시즌이에요. 지난 시즌 결과는 다음 달부터 볼 수 있어요.`
              : '아직 순위에 오른 크루가 없어요. 시즌 멤버 3명이 달리면 순위에 올라요.'}
          </Text>
        )}
      </View>

      {unranked.length > 0 ? (
        <View style={crewListStyles.section}>
          <CrewSectionHeader title="순위 밖" meta={`${unranked.length}크루`} />
          <Card style={crewListStyles.rowsCard}>
            {unranked.map((row, index) => (
              <CrewStandingListRow
                key={row.crewId}
                row={row}
                isFirst={index === 0}
                meta={`${row.seasonMemberCount}명`}
                rightText={formatCrewUnrankedShort(row.unrankedReason)}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
