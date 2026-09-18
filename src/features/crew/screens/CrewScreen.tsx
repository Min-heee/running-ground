import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
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
  CREW_BOARD_PREVIEW_LIMIT,
  buildCrewBoardEmptyCopy,
  buildCrewCancelRequestConfirmMessage,
  buildCrewHeroMeta,
  buildCrewHeroSeasonNote,
  buildCrewInviteShareMessage,
  buildCrewLeaveConfirmMessage,
  buildCrewPreseasonNote,
  buildCrewSeasonStatusLine,
  describeCrewUnranked,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewRequestDate,
  getCrewErrorMessage,
  isCrewStateDriftError,
  sortCrewMembersForDisplay,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 크루대전 탭 (오너 2026-09-18, 시안 A '월간 크루 리그'). 전국 크루가 한 순위표에 오르고, KST 달력
// 한 달이 시즌이며, 달의 1위 크루가 별 ★을 받는다. 포인트는 없다 — 별과 기록뿐.
//
// 화면 언어는 지금 앱 그대로 (오너: "현재 앱이랑 너무 다르면 안 된다"): 맨바닥 히어로(큰 숫자
// 하나 = 순위) → 달 머리글 + 흰 블록 한 겹의 헤어라인 행(기록 탭) → 설정식 액션 행(마이 탭 계정
// 카드). '이번 달 | 지난 시즌' 스위치는 오너 2026-09-18에 없앴다 — 맨 위가 '이번 시즌' 순위표이고,
// 지난 시즌은 순위표 오른쪽 아래 '지난 시즌 ›'에서 따로 연다(CrewLastSeasonScreen).
//
// 폴링 없음: 순위는 하루에 몇 번 바뀌는 느린 값이라 탭에 들어올 때마다(포커스) 다시 부른다.

// 첫 프레임을 가볍게 — 친구·마이 탭과 같은 지연.
const CREW_INITIAL_FETCH_DEFER_MS = 120;

function openLeague() {
  router.push('/crew-league');
}

function openLastSeason() {
  router.push('/crew-last-season');
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

// 순위 기준 (오너 2026-09-18): 전체 순위 맨 아래에 있던 점수 설명을 크루 탭 행 하나로 뺐다.
function openRules() {
  router.push('/crew-rules');
}

export default function CrewScreen() {
  useTabWarmupTrace('crew');
  const { home, error, nowMs, loadHome, applyHome } = useCrewHome();
  const [busy, setBusy] = useState(false);
  // Alert 이중 탭·연타 가드는 state가 아니라 ref로 — state는 같은 렌더 배치에서 낡은 값이라
  // 두 번째 호출을 못 막는다 (그라운드 화면 적대 리뷰와 같은 교훈).
  const actionInFlightRef = useRef(false);

  useAndroidDeferredFocusEffect(() => {
    void loadHome();
  }, [loadHome], {
    delayMs: CREW_INITIAL_FETCH_DEFER_MS,
    source: 'crew screen',
    tab: 'crew',
    traceInitialFetch: true,
    work: 'crew data fetch',
  });

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
          <CrewBoardSection home={home} />

          {home.myCrew ? (
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

// 맨 위 '이번 시즌' 순위 카드: 상위 5개 + '전체 순위 ›', 카드 오른쪽 아래 '지난 시즌 ›' (오너
// 2026-09-18: 두 갈래 스위치 대신 이번 시즌 하나 + 지난 시즌 화살표). 순위에 오른 크루가 하나라도
// 있으면 바로 순위표 — 예전의 '크루 모집 중'(3개 미만이면 가림)은 오너가 같은 날 없앴다.
const CrewBoardSection = memo(function CrewBoardSection({ home }: { home: CrewHomeResponse }) {
  const rows = home.top.slice(0, CREW_BOARD_PREVIEW_LIMIT);
  const emptyCopy = buildCrewBoardEmptyCopy(Boolean(home.myCrew));

  return (
    <View style={crewListStyles.section}>
      <CrewSectionHeader title="이번 시즌" meta={home.rankedCrewCount > 0 ? `${home.rankedCrewCount}크루` : null} />
      <Card style={crewListStyles.rowsCard}>
        {rows.length > 0 ? rows.map((row, index) => (
          <CrewStandingListRow key={row.crewId} row={row} isFirst={index === 0} />
        )) : (
          <View style={crewListStyles.emptyBlock}>
            <Text style={crewListStyles.emptyTitle}>{emptyCopy.title}</Text>
            <Text style={crewListStyles.emptyText}>{emptyCopy.body}</Text>
          </View>
        )}
        <CrewFooterRow label="전체 순위" onPress={openLeague} />
      </Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="지난 시즌"
        onPress={openLastSeason}
        hitSlop={8}
        style={styles.lastSeasonLink}
      >
        <Text style={styles.lastSeasonLinkText}>지난 시즌</Text>
        <Text style={crewListStyles.footerChevron}>›</Text>
      </Pressable>
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

      {/* 크루 기여는 가져온 기록까지 세지만(오너 2026-09-18), 겹친 기록은 하나만·손으로 적은 기록은
          빼고·가입 뒤 기록만이라 기록 탭의 이번 달 거리와 다를 수 있다 — 그래서 '이번 달 거리'라고
          부르지 않고 '기여'라고 부른다. */}
      <View style={crewListStyles.section}>
        <CrewSectionHeader title="우리 크루 기여" />
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
        <CrewActionRow isFirst={false} label="순위 기준" chevron onPress={openRules} />
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
        meta="크루원이 달린 거리가 모여 크루 순위가 돼요."
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
        <CrewActionRow isFirst={false} label="순위 기준" chevron onPress={openRules} />
      </Card>

    </>
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
  // 순위표 카드 오른쪽 아래 '지난 시즌 ›' — 카드 안 '전체 순위 ›'보다 한 단계 낮은 글자 링크.
  lastSeasonLink: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  lastSeasonLinkText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
