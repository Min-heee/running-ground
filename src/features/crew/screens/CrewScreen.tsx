import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import { TabHeader } from '@/components/ui/TabHeader';
import type { CrewHomeResponse, CrewPendingRequest, MyCrew } from '@/lib/api/types/crew';
import { cancelCrewJoinRequest, leaveCrew } from '@/services';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { useAndroidDeferredFocusEffect } from '@/utils/useAndroidDeferredInteractionEffect';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { CrewHero } from '../components/CrewHero';
import {
  CrewActionRow,
  CrewFooterRow,
  CrewMemberListRow,
  CrewSectionHeader,
  CrewStandingListRow,
} from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  CREW_BOARD_MIN_RANKED_CREWS,
  CREW_BOARD_PREVIEW_LIMIT,
  CREW_MIN_RANKED_MEMBERS,
  buildCrewCancelRequestConfirmMessage,
  buildCrewHeroMeta,
  buildCrewHeroSeasonNote,
  buildCrewInviteShareMessage,
  buildCrewLastSeasonHeadline,
  buildCrewLeaveConfirmMessage,
  buildCrewPreseasonNote,
  buildCrewSeasonStatusLine,
  describeCrewUnranked,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewRequestDate,
  getCrewErrorMessage,
  isCrewBoardOpen,
  isCrewFirstSeason,
  isCrewStateDriftError,
  shiftCrewSeasonKey,
  sortCrewMembersForDisplay,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';
import { useCrewLeague, type CrewLeagueState } from '../hooks/useCrewLeague';

// 크루대전 탭 (오너 2026-09-18, 시안 A '월간 크루 리그'). 전국 크루가 한 순위표에 오르고, KST 달력
// 한 달이 시즌이며, 달의 1위 크루가 별 ★을 받는다. 포인트는 없다 — 별과 기록뿐.
//
// 화면 언어는 지금 앱 그대로 (오너: "현재 앱이랑 너무 다르면 안 된다"): 맨바닥 히어로(큰 숫자
// 하나 = 순위) → 달 머리글 + 흰 블록 한 겹의 헤어라인 행(기록 탭) → 설정식 액션 행(마이 탭 계정
// 카드). 스위치는 공용 SegmentSwitch 하나, 선택 = 보라 솔리드 + 흰 글씨.
//
// 폴링 없음: 순위는 하루에 몇 번 바뀌는 느린 값이라 탭에 들어올 때마다(포커스) 다시 부른다.

type CrewSegment = 'current' | 'last';

const SEASON_SEGMENT_ITEMS: readonly { id: CrewSegment; label: string }[] = [
  { id: 'current', label: '이번 달' },
  { id: 'last', label: '지난 시즌' },
];

// 첫 프레임을 가볍게 — 친구·마이 탭과 같은 지연.
const CREW_INITIAL_FETCH_DEFER_MS = 120;
// 지난 시즌은 봉인 스냅샷의 상위 10개만 (원장이 10개까지만 담는다).
const LAST_SEASON_ROW_LIMIT = 10;

function openLeague() {
  router.push('/crew-league');
}

function openCreate() {
  router.push('/crew-create');
}

function openJoin() {
  router.push('/crew-join');
}

function openSearch() {
  router.push('/crew-search');
}

function openManage() {
  router.push('/crew-manage');
}

export default function CrewScreen() {
  useTabWarmupTrace('crew');
  const { home, error, nowMs, loadHome, applyHome } = useCrewHome();
  const [segment, setSegment] = useState<CrewSegment>('current');
  const [busy, setBusy] = useState(false);
  // Alert 이중 탭·연타 가드는 state가 아니라 ref로 — state는 같은 렌더 배치에서 낡은 값이라
  // 두 번째 호출을 못 막는다 (그라운드 화면 적대 리뷰와 같은 교훈).
  const actionInFlightRef = useRef(false);
  const previousSeasonKey = home ? shiftCrewSeasonKey(home.season.seasonKey, -1) : null;
  // 홈의 lastSeason은 지난 시즌이 봉인되면 null → 그 시즌 키로 바뀐다. 포커스 재조회에서 이 값이
  // 바뀌면 들고 있던 '집계 중' 순위표를 봉인 스냅샷으로 다시 부른다 (적대 리뷰 2026-09-18).
  const lastSeason = useCrewLeague(previousSeasonKey, segment === 'last', home?.lastSeason?.seasonKey ?? null);

  useAndroidDeferredFocusEffect(() => {
    void loadHome();
  }, [loadHome], {
    delayMs: CREW_INITIAL_FETCH_DEFER_MS,
    source: 'crew screen',
    tab: 'crew',
    traceInitialFetch: true,
    work: 'crew data fetch',
  });

  const handleSelectSegment = useCallback((id: string) => setSegment(id as CrewSegment), []);

  const runAction = useCallback(async (action: () => Promise<CrewHomeResponse>, failMessage: string) => {
    if (actionInFlightRef.current) {
      return;
    }
    actionInFlightRef.current = true;
    setBusy(true);

    try {
      applyHome(await action());
    } catch (actionError) {
      showCrewNotice('크루', getCrewErrorMessage(actionError, failMessage));
      // 그새 내보내졌거나 크루가 닫혔다 — 낡은 크루 화면을 두지 않고 바로 다시 부른다.
      if (isCrewStateDriftError(actionError)) {
        void loadHome();
      }
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [applyHome, loadHome]);

  const handleShareInvite = useCallback(async (myCrew: MyCrew) => {
    const message = buildCrewInviteShareMessage(myCrew.crew.name, myCrew.inviteCode);

    try {
      await Share.share({ message });
    } catch {
      // 공유 시트가 없는 환경(웹 등) — 링크째 복사로 대신한다.
      try {
        await Clipboard.setStringAsync(message);
        showCrewNotice('크루', '초대 링크를 복사했어요.');
      } catch {
        // 공유도 복사도 안 되면 조용히 둔다 — 코드는 행 글자에 이미 보인다.
      }
    }
  }, []);

  const handleLeave = useCallback((currentHome: CrewHomeResponse, myCrew: MyCrew) => {
    confirmCrewAction({
      title: '크루 나가기',
      message: buildCrewLeaveConfirmMessage({
        joinsLeftThisMonth: currentHome.joinsLeftThisMonth,
        isCaptain: myCrew.role === 'captain',
        memberCount: myCrew.crew.memberCount,
      }),
      confirmLabel: '나가기',
      destructive: true,
      onConfirm: () => {
        void runAction(() => leaveCrew(myCrew.crew.id), '크루를 나가지 못했어요.');
      },
    });
  }, [runAction]);

  const handleCancelRequest = useCallback((request: CrewPendingRequest) => {
    confirmCrewAction({
      title: '가입 신청 취소',
      message: buildCrewCancelRequestConfirmMessage(request.crewName),
      confirmLabel: '신청 취소',
      destructive: true,
      onConfirm: () => {
        void runAction(() => cancelCrewJoinRequest(request.requestId), '가입 신청을 취소하지 못했어요.');
      },
    });
  }, [runAction]);

  if (!home && !error) {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <TabHeader title="크루대전" />

      {error && !home ? (
        <Card>
          <Text style={styles.errorTitle}>크루 정보를 불러오지 못했어요</Text>
          <Text style={crewListStyles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={() => { void loadHome(); }} />
        </Card>
      ) : null}

      {home ? (
        <>
          <SegmentSwitch items={SEASON_SEGMENT_ITEMS} activeId={segment} onSelect={handleSelectSegment} />

          {segment === 'last' ? (
            <LastSeasonView home={home} state={lastSeason.state} onRetry={lastSeason.reload} />
          ) : home.myCrew ? (
            <MyCrewView
              home={home}
              myCrew={home.myCrew}
              nowMs={nowMs}
              busy={busy}
              onShare={handleShareInvite}
              onLeave={handleLeave}
            />
          ) : (
            <NoCrewView home={home} busy={busy} onCancelRequest={handleCancelRequest} />
          )}
        </>
      ) : null}
    </Screen>
  );
}

// 이번 시즌 순위 카드: 상위 5개 + '전체 순위 ›'. 순위에 오른 크루가 3개 미만이면 빈 순위표 대신
// '크루 모집 중' (심사 must-fix: 크루 2개짜리 순위표는 죽은 화면이다).
const CrewBoardSection = memo(function CrewBoardSection({ home }: { home: CrewHomeResponse }) {
  const boardOpen = isCrewBoardOpen(home.rankedCrewCount);
  const rows = home.top.slice(0, CREW_BOARD_PREVIEW_LIMIT);

  return (
    <View style={crewListStyles.section}>
      <CrewSectionHeader title="크루 순위" meta={boardOpen ? `${home.rankedCrewCount}크루` : null} />
      <Card style={crewListStyles.rowsCard}>
        {boardOpen ? rows.map((row, index) => (
          <CrewStandingListRow key={row.crewId} row={row} isFirst={index === 0} />
        )) : (
          <View style={crewListStyles.emptyBlock}>
            <Text style={crewListStyles.emptyTitle}>크루 모집 중</Text>
            <Text style={crewListStyles.emptyText}>
              순위에 오른 크루가 {CREW_BOARD_MIN_RANKED_CREWS}개가 되면 순위표가 열려요.
              시즌 멤버 {CREW_MIN_RANKED_MEMBERS}명이 앱으로 달리면 크루가 순위에 올라요.
            </Text>
          </View>
        )}
        <CrewFooterRow label="전체 순위" onPress={openLeague} />
      </Card>
    </View>
  );
});

const MyCrewView = memo(function MyCrewView({
  home,
  myCrew,
  nowMs,
  busy,
  onShare,
  onLeave,
}: {
  home: CrewHomeResponse;
  myCrew: MyCrew;
  nowMs: number;
  busy: boolean;
  onShare: (myCrew: MyCrew) => void;
  onLeave: (home: CrewHomeResponse, myCrew: MyCrew) => void;
}) {
  const { crew, standing, members, role, inviteCode, pendingRequestCount } = myCrew;
  const sortedMembers = useMemo(() => sortCrewMembersForDisplay(members), [members]);
  const heroMeta = standing.rank === null
    ? describeCrewUnranked(standing.unrankedReason, members, standing.seasonMemberCount)
    : buildCrewHeroMeta(standing, home.top);

  return (
    <>
      <CrewHero
        label={`${formatCrewNameWithStars(crew.name, crew.stars)} · ${crew.memberCount}명`}
        value={formatCrewRank(standing.rank)}
        meta={heroMeta}
        note={buildCrewHeroSeasonNote(home.season)}
      />

      <CrewBoardSection home={home} />

      {/* '앱으로 기록한 러닝' 꼬리표는 빼지 않는다 (설계 리스크: 크루 기여는 앱 GPS 기록만·하루 45km·
          종료 시각 기준이라 기록 탭의 이번 달 거리와 다를 수 있다 — 두 숫자를 같은 이름으로 부르지 않는다). */}
      <View style={crewListStyles.section}>
        <CrewSectionHeader title="우리 크루 기여" meta="앱으로 기록한 러닝" />
        <Card style={crewListStyles.rowsCard}>
          {sortedMembers.map((member, index) => (
            <CrewMemberListRow key={member.userId} member={member} isFirst={index === 0} nowMs={nowMs} />
          ))}
        </Card>
      </View>

      <Card style={crewListStyles.actionsCard}>
        <CrewActionRow isFirst label={`초대 코드 공유 · ${inviteCode}`} onPress={() => onShare(myCrew)} />
        {role === 'captain' ? (
          <CrewActionRow
            isFirst={false}
            label="크루 관리"
            value={pendingRequestCount > 0 ? `신청 ${pendingRequestCount}` : null}
            valueTone="brand"
            onPress={openManage}
          />
        ) : null}
        <CrewActionRow isFirst={false} label="크루 나가기" danger disabled={busy} onPress={() => onLeave(home, myCrew)} />
      </Card>
    </>
  );
});

const NoCrewView = memo(function NoCrewView({
  home,
  busy,
  onCancelRequest,
}: {
  home: CrewHomeResponse;
  busy: boolean;
  onCancelRequest: (request: CrewPendingRequest) => void;
}) {
  const pendingRequest = home.myPendingRequest;

  return (
    <>
      <CrewHero
        label={buildCrewSeasonStatusLine(home.season)}
        meta="크루원이 앱으로 달린 거리가 모여 크루 순위가 돼요."
        note={buildCrewPreseasonNote(home.season)}
      />

      <PrimaryButton label="크루 만들기" onPress={openCreate} />

      <Card style={crewListStyles.actionsCard}>
        {pendingRequest ? (
          <View style={crewListStyles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${pendingRequest.crewName} 크루 보기`}
              onPress={() => router.push({ pathname: '/crew-detail', params: { crewId: pendingRequest.crewId } })}
              style={styles.pendingBody}
            >
              <Text style={crewListStyles.actionLabel} numberOfLines={1}>{pendingRequest.crewName} 가입 신청 중</Text>
              <Text style={styles.pendingMeta}>{formatCrewRequestDate(pendingRequest.createdAt)} · 캡틴이 승인하면 들어가요</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가입 신청 취소"
              disabled={busy}
              onPress={() => onCancelRequest(pendingRequest)}
              hitSlop={10}
            >
              <Text style={crewListStyles.textAction}>취소</Text>
            </Pressable>
          </View>
        ) : null}
        <CrewActionRow isFirst={!pendingRequest} label="초대 코드로 가입" onPress={openJoin} />
        <CrewActionRow isFirst={false} label="크루 찾기" onPress={openSearch} />
      </Card>

      <CrewBoardSection home={home} />
    </>
  );
});

// 지난 시즌: 우승 한 줄 + 봉인 스냅샷 상위 10개. 봉인된 시즌은 서버가 원장 스냅샷만 준다 —
// 기록이 나중에 바뀌어도 여기 숫자는 안 바뀐다. 봉인 전 48시간은 '집계 중'으로 라이브 값을 보인다.
const LastSeasonView = memo(function LastSeasonView({
  home,
  state,
  onRetry,
}: {
  home: CrewHomeResponse;
  state: CrewLeagueState;
  onRetry: () => void;
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }

  if (state.status === 'error') {
    return (
      <Card>
        <Text style={crewListStyles.errorText}>{state.message}</Text>
        <PrimaryButton label="다시 불러오기" onPress={onRetry} />
      </Card>
    );
  }

  const league = state.status === 'ready' ? state.league : null;
  const rows = (league?.ranked ?? []).slice(0, LAST_SEASON_ROW_LIMIT);

  if (!league || rows.length === 0) {
    return (
      <Text style={styles.lastEmpty}>
        {isCrewFirstSeason(home.season)
          ? `${home.season.label}이 첫 시즌이에요. 지난 시즌 결과는 다음 달부터 여기서 볼 수 있어요.`
          : '지난 시즌엔 순위에 오른 크루가 없었어요.'}
      </Text>
    );
  }

  // 우승은 순위만으로 정해지지 않는다(뛴 멤버 3명·시즌 끝까지 살아 있는 크루) — 서버 원장의
  // 챔피언 목록이 이 시즌 것일 때만 쓴다.
  const champions = home.lastSeason?.seasonKey === league.season.seasonKey ? home.lastSeason.champions : [];

  return (
    <View style={crewListStyles.section}>
      <Text style={styles.lastHeadline}>
        {buildCrewLastSeasonHeadline({ season: league.season, sealed: league.sealed, champions })}
      </Text>
      <Card style={crewListStyles.rowsCard}>
        {rows.map((row, index) => (
          <CrewStandingListRow key={row.crewId} row={row} isFirst={index === 0} />
        ))}
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  errorTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  pendingBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  pendingMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  lastHeadline: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
  },
  lastEmpty: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
