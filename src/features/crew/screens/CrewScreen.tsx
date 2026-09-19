import { memo, useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TabHeader } from '@/components/ui/TabHeader';
import type { CrewHomeResponse, CrewPendingRequest, MyCrew } from '@/lib/api/types/crew';
import { cancelCrewJoinRequest } from '@/services';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { useAndroidDeferredFocusEffect } from '@/utils/useAndroidDeferredInteractionEffect';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { CrewHero } from '../components/CrewHero';
import {
  CrewActionRow,
  CrewFooterRow,
  CrewStandingEmptyRow,
  CrewStandingListRow,
} from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  CREW_BOARD_PREVIEW_LIMIT,
  buildCrewBoardEmptyCopy,
  buildCrewCancelRequestConfirmMessage,
  buildCrewClimbGauge,
  buildCrewMyCardMeta,
  buildCrewSeasonProgressLabel,
  describeCrewRankChange,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewRequestDate,
  getCrewErrorMessage,
  hasCrewRankChanges,
  isCrewSeasonFinalDays,
  isCrewStateDriftError,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 크루대전 탭 (오너 2026-09-18, 시안 A '월간 크루 리그'). 전국 크루가 한 순위표에 오르고, KST 달력
// 한 달이 시즌이며, 달의 1위 크루가 별 ★을 받는다. 포인트는 없다 — 별과 기록뿐.
//
// 화면 언어는 지금 앱 그대로 (오너: "현재 앱이랑 너무 다르면 안 된다"): 맨바닥 히어로(큰 숫자
// 하나 = 순위) → 달 머리글 + 흰 블록 한 겹의 헤어라인 행(기록 탭) → 설정식 액션 행(마이 탭 계정
// 카드). '이번 달 | 지난 시즌' 스위치는 오너 2026-09-18에 없앴다 — 맨 위가 '크루 랭킹' 순위표이고,
// 지난 시즌은 순위표 오른쪽 아래 '지난 시즌 ›'에서 따로 연다(CrewLastSeasonScreen).
// 크루가 있으면 그 아래 '내 크루' 카드, '크루 둘러보기' 카드, '순위 기준 및 크루 설명' 행뿐이다 — 멤버
// 기여·초대 코드 공유·크루 관리·크루 나가기는 카드를 눌러 들어가는 내 크루 화면(CrewMyCrewScreen)에 있다.
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

// 내 크루 카드 → 내 크루 화면 (멤버 기여·초대 코드 공유·크루 관리·크루 나가기).
function openMyCrew() {
  router.push('/crew-mine');
}

// 순위 기준 및 크루 설명 (오너 2026-09-18): 전체 순위 맨 아래에 있던 점수 설명을 크루 탭 행 하나로 뺐다.
function openRules() {
  router.push('/crew-rules');
}

export default function CrewScreen() {
  useTabWarmupTrace('crew');
  const { home, error, loadHome, applyHome } = useCrewHome();
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
            <MyCrewView home={home} myCrew={home.myCrew} />
          ) : (
            <NoCrewView home={home} busy={busy} onCancelRequest={handleCancelRequest} />
          )}
        </>
      ) : null}
    </Screen>
  );
}

// 맨 위 '크루 랭킹' 순위 카드(이번 시즌): 상위 5개 + '전체 순위 ›', 카드 오른쪽 아래 '지난 시즌 ›'
// (오너 2026-09-18: 두 갈래 스위치 대신 이번 시즌 하나 + 지난 시즌 화살표, 제목은 '크루 랭킹'). 순위에 오른 크루가 하나라도
// 있으면 바로 순위표 — 예전의 '크루 모집 중'(3개 미만이면 가림)은 오너가 같은 날 없앴다.
const CrewBoardSection = memo(function CrewBoardSection({ home }: { home: CrewHomeResponse }) {
  const rows = home.top.slice(0, CREW_BOARD_PREVIEW_LIMIT);
  const showChange = hasCrewRankChanges(rows);
  const emptyCopy = buildCrewBoardEmptyCopy(Boolean(home.myCrew));

  return (
    <View style={crewListStyles.section}>
      <Card style={crewListStyles.rowsCard}>
        {/* 제목은 카드 안에 (오너 2026-09-19: '크루 랭킹이랑 내 크루를 해당 카드 안으로'). */}
        {/* 제목 옆은 남은 날만 (오너 2026-09-19: '6크루'는 빼고 '12일 남음'), 마지막 3일은 보라. */}
        <View style={styles.cardHeader}>
          <Text style={crewListStyles.sectionTitle}>크루 랭킹</Text>
          <Text
            style={[crewListStyles.sectionMeta, isCrewSeasonFinalDays(home.season) ? styles.finalDays : null]}
            numberOfLines={1}
          >
            {buildCrewSeasonProgressLabel(home.season)}
          </Text>
        </View>
        {rows.map((row, index) => (
          <CrewStandingListRow key={row.crewId} row={row} isFirst={index === 0} showChange={showChange} />
        ))}
        {/* 크루가 모자라도 1~5등 자리는 늘 보인다 (오너 2026-09-19). */}
        {Array.from({ length: Math.max(0, CREW_BOARD_PREVIEW_LIMIT - rows.length) }, (_, index) => (
          <CrewStandingEmptyRow
            key={`empty-${rows.length + index + 1}`}
            rank={rows.length + index + 1}
            isFirst={rows.length + index === 0}
            showChange={showChange}
          />
        ))}
        {rows.length === 0 ? (
          <View style={[crewListStyles.emptyBlock, styles.boardEmptyNote]}>
            <Text style={crewListStyles.emptyTitle}>{emptyCopy.title}</Text>
            <Text style={crewListStyles.emptyText}>{emptyCopy.body}</Text>
          </View>
        ) : null}
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

// 내 크루 카드 (오너 2026-09-18: "크루 탭이 너무 어수선하다" — 탭엔 크루 랭킹 카드와 이 카드만).
// 누르면 내 크루 화면(CrewMyCrewScreen)에서 멤버 기여·초대 코드 공유·크루 관리·크루 나가기를 한다.
// 순위 밖이어도 큰 글자 아래 설명 줄은 없다(같은 날 오너가 '시즌 멤버가 3명이 되면…'을 뺐다).
// 캡틴에게 온 가입 신청은 카드 오른쪽에 '신청 N'으로만 알린다 — 처리는 안에서.
const MyCrewView = memo(function MyCrewView({ home, myCrew }: { home: CrewHomeResponse; myCrew: MyCrew }) {
  const { crew, standing, members, pendingRequestCount } = myCrew;
  const rank = formatCrewRank(standing.rank);
  const meta = buildCrewMyCardMeta(standing, members);
  const gauge = buildCrewClimbGauge(standing, home.top);
  const change = describeCrewRankChange(standing);
  // 카드의 글자를 그대로 읽어 준다 — 캡틴에게 '신청 N'은 이제 탭에서 유일한 신청 신호다(적대 리뷰).
  const a11yLabel = [
    `내 크루 ${crew.name}`,
    `${crew.memberCount}명`,
    rank,
    change?.a11y,
    meta,
    gauge ? [gauge.label, gauge.value].filter(Boolean).join(' ') : null,
    pendingRequestCount > 0 ? `가입 신청 ${pendingRequestCount}건` : null,
  ].filter(Boolean).join(', ');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="내 크루 화면을 열어요"
        onPress={openMyCrew}
      >
        <Card>
          {/* 제목은 카드 안에 (오너 2026-09-19). */}
          <Text style={crewListStyles.sectionTitle}>내 크루</Text>
          <View style={styles.myCrewRow}>
            <View style={styles.myCrewBody}>
              <CrewHero
                label={`${formatCrewNameWithStars(crew.name, crew.stars)} · ${crew.memberCount}명`}
                value={rank}
                valueChange={change}
                meta={meta}
              />
            </View>
            <View style={styles.myCrewSide}>
              {pendingRequestCount > 0 ? <Text style={styles.myCrewBadge}>신청 {pendingRequestCount}</Text> : null}
              <Text style={crewListStyles.footerChevron}>›</Text>
            </View>
          </View>
          {/* 한 계단 위 추격 게이지 (오너 2026-09-19): 홈 포인트 게이지와 같은 보라 막대. */}
          {gauge ? (
            <View style={styles.gauge}>
              <View style={styles.gaugeLabels}>
                <Text style={styles.gaugeLabel}>{gauge.label}</Text>
                {gauge.value ? <Text style={styles.gaugeValue}>{gauge.value}</Text> : null}
              </View>
              <View style={styles.gaugeTrack}>
                <View style={[styles.gaugeFill, { width: `${Math.round(gauge.progress * 100)}%` }]} />
              </View>
            </View>
          ) : null}
        </Card>
      </Pressable>

      <CrewBrowseCard hasCrew />

      <Card style={crewListStyles.actionsCard}>
        <CrewActionRow isFirst label="순위 기준 및 크루 설명" chevron onPress={openRules} />
      </Card>
    </>
  );
});

// 크루 둘러보기 카드 (오너 2026-09-19: "사람들이 크루를 찾아 가입 신청할 수 있게 — 크루 둘러보기 카드를
// 만들어 누르면 크루들을 볼 수 있게"). 누르면 공개 크루 목록(순위 순서 + 이름 검색) → 크루 상세 → 가입 신청.
// 크루가 있는 사람도 다른 크루를 구경할 수 있게 두 화면 모두에 둔다(신청 버튼은 크루 상세가 알아서 숨긴다).
const CrewBrowseCard = memo(function CrewBrowseCard({ hasCrew }: { hasCrew: boolean }) {
  const sub = hasCrew ? '다른 크루들을 둘러볼 수 있어요' : '크루를 둘러보고 가입 신청할 수 있어요';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`크루 둘러보기, ${sub}`}
      onPress={openSearch}
    >
      <Card style={styles.browseCard}>
        <View style={styles.browseBody}>
          <Text style={styles.browseTitle}>크루 둘러보기</Text>
          <Text style={styles.browseSub}>{sub}</Text>
        </View>
        <Text style={crewListStyles.footerChevron}>›</Text>
      </Card>
    </Pressable>
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

  // 시즌 안내 히어로('9월 프리시즌 · 13일 남음' + 설명 두 줄)는 오너 2026-09-18에 뺐다 — 크루
  // 랭킹 카드 바로 아래가 '크루 만들기'다. 규칙 설명은 '순위 기준 ›' 페이지에 있다.
  return (
    <>
      <CrewBrowseCard hasCrew={false} />

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
        <CrewActionRow isFirst={false} label="순위 기준 및 크루 설명" chevron onPress={openRules} />
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
  // 크루 둘러보기 카드: 제목 + 한 줄 설명, 오른쪽 꺾쇠.
  browseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  browseBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  browseTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  browseSub: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  finalDays: {
    color: colors.brandStrong,
    fontWeight: fontWeights.extraBold,
  },
  gauge: {
    gap: spacing.xs,
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  gaugeLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  gaugeValue: {
    color: colors.brandStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  // 홈 포인트 게이지 막대와 같은 값(높이 10, borderMuted 트랙, 브랜드 채움).
  gaugeTrack: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: fixedColors.brand,
  },
  // 빈 순위표 안내(오너 문구)는 빈 등수 5줄 아래 헤어라인으로 나눈다.
  boardEmptyNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  // 크루 랭킹 카드 안 제목 줄 — 행과 같은 좌우 여백.
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s16,
    paddingBottom: spacing.xs,
  },
  // 내 크루 카드: 제목 아래 왼쪽 히어로(이름·순위·인당 km), 오른쪽 '신청 N' + 꺾쇠.
  myCrewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  myCrewBody: {
    flex: 1,
    minWidth: 0,
  },
  myCrewSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // brandStrong: 다크 유리 카드에서도 글자 대비가 선다(예전 '크루 관리 신청 N' 값과 같은 색).
  myCrewBadge: {
    color: colors.brandStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
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
