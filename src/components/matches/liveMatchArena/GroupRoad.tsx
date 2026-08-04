import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  ROAD_HEIGHT_GROUP,
  TOWER_LIST_VERTICAL_INSET,
  TOWER_ROW_HEIGHT,
  areParticipantArraysEqual,
  areParticipantsEqual,
  isForfeited,
} from '@/components/matches/liveMatchArena/helpers';
import {
  RANK_SHIFT_VISIBLE_MS,
  advanceRankShiftState,
  buildGroupGapLabel,
  createEmptyRankShiftState,
  isRankShiftVisibleAt,
  resolveRankNumber,
  type RankShiftDirection,
  type RankShiftState,
} from '@/components/matches/liveMatchArena/groupTimingTower';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import { colors } from '@/theme/tokens';

// 그룹로드 = F1 타이밍 타워 (오너 2026-08-05). 이전의 "세로 트랙 위 순위 리스트"는
// 점 위치가 진행도와 무관해 레이스 느낌이 없었다. 타워는 순위 · 색 띠 · 이름 ·
// 앞줄과의 간격만 보여주고, 순위 변동은 ▲▼로 잠깐 표시한다. 절대 진행도(막대)는
// 레이스보드 탭 담당이라 여기서는 간격(접전)에 집중한다. 30명이어도 구조가 안 변한다.

// 헤더(순위·간격 + 나 중심 토글) 행의 고정 높이 — 카드 적응 높이 계산에 쓴다.
const TOWER_HEADER_HEIGHT = 46;

// "나 중심" 선호는 모듈 스코프에 산다: 아레나 페이지는 탭을 떠날 때마다 언마운트되므로
// 컴포넌트 state만으로는 매치 중 탭을 오갈 때마다 체크가 풀린다 (적대 리뷰 2026-08-05).
let centerOnMePreference = false;

const RUNNER_DOT_PALETTE = [
  colors.runnerDotTeal,
  colors.runnerDotSky,
  colors.runnerDotOrange,
  colors.runnerDotPink,
  colors.runnerDotLime,
  colors.runnerDotAmber,
];

// Stable, RANK-INDEPENDENT color for a group runner. Keyed on the participant id
// (which never changes during a race) so a runner keeps ONE color start to finish —
// the color bar never recolors as ranks swap. 'me' stays brand purple and a
// forfeited runner stays danger red — neither depends on rank.
function getGroupRunnerBarColor(id: string, isCurrentUser: boolean, forfeited: boolean) {
  if (forfeited) {
    return colors.dangerVivid;
  }
  if (isCurrentUser) {
    return colors.brand;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return RUNNER_DOT_PALETTE[Math.abs(hash) % RUNNER_DOT_PALETTE.length];
}

const TowerShiftMark = memo(function TowerShiftMark({
  direction,
}: {
  direction: RankShiftDirection | null;
}) {
  if (!direction) {
    return <View style={styles.towerShiftSlot} />;
  }

  return (
    <View style={styles.towerShiftSlot}>
      <Text style={direction === 'up' ? styles.towerShiftUp : styles.towerShiftDown}>
        {direction === 'up' ? '▲' : '▼'}
      </Text>
    </View>
  );
});

type TowerRowProps = {
  participant: ArenaParticipant;
  index: number;
  gapLabel: string;
  shiftDirection: RankShiftDirection | null;
};

const GroupTowerRow = memo(function GroupTowerRow({
  participant,
  index,
  gapLabel,
  shiftDirection,
}: TowerRowProps) {
  const isCurrentUser = Boolean(participant.isCurrentUser);
  const participantForfeited = isForfeited(participant);
  const rankNumber = resolveRankNumber(participant, index);
  const displayName = isCurrentUser ? '나' : participant.name;
  const rowStyle = useMemo(
    () => [
      styles.towerRow,
      isCurrentUser ? styles.towerRowCurrent : undefined,
      participantForfeited ? styles.towerRowForfeited : undefined,
    ],
    [isCurrentUser, participantForfeited],
  );
  const barStyle = useMemo(
    () => [
      styles.towerColorBar,
      { backgroundColor: getGroupRunnerBarColor(participant.id, isCurrentUser, participantForfeited) },
    ],
    [isCurrentUser, participant.id, participantForfeited],
  );

  return (
    <View style={rowStyle}>
      <Text style={styles.towerRank}>{rankNumber}</Text>
      <TowerShiftMark direction={shiftDirection} />
      <View style={barStyle} />
      <Text
        style={isCurrentUser ? styles.towerNameCurrent : styles.towerName}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Text style={isCurrentUser ? styles.towerGapCurrent : styles.towerGap}>
        {gapLabel}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && prevProps.gapLabel === nextProps.gapLabel
  && prevProps.shiftDirection === nextProps.shiftDirection
  && areParticipantsEqual(prevProps.participant, nextProps.participant)
));

type TowerListItem = {
  participant: ArenaParticipant;
  gapLabel: string;
  shiftDirection: RankShiftDirection | null;
};

export const GroupRoad = memo(function GroupRoad({
  participants,
}: {
  participants: ArenaParticipant[];
}) {
  const listRef = useRef<FlatList<TowerListItem>>(null);
  // "나 중심" 토글 (오너 2026-08-05): 순위가 계속 뒤바뀌며 줄이 움직이므로,
  // 켜면 내 줄이 화면 가운데로 따라온다. 기본은 꺼짐(자유 스크롤).
  const [centerOnMe, setCenterOnMe] = useState(() => centerOnMePreference);
  const toggleCenterOnMe = useCallback(() => setCenterOnMe((current) => {
    centerOnMePreference = !current;
    return !current;
  }), []);

  // 순위 변동(▲▼) 상태는 렌더 중 ref 캐시로 굴린다: participants 참조가 바뀔 때
  // 한 번만 전진시키고, 같은 참조로 다시 렌더되면 캐시를 쓴다. setState 경유가
  // 아니므로 1Hz 거리 틱마다 추가 렌더가 생기지 않는다 (라이브 렌더 예산 규칙).
  const shiftCacheRef = useRef<{ source: ArenaParticipant[] | null; state: RankShiftState }>({
    source: null,
    state: createEmptyRankShiftState(),
  });
  if (shiftCacheRef.current.source !== participants) {
    shiftCacheRef.current = {
      source: participants,
      state: advanceRankShiftState(shiftCacheRef.current.state, participants, Date.now()),
    };
  }
  const shiftById = shiftCacheRef.current.state.shiftById;

  // 피드가 조용해진 뒤(경기 종료 등) 화살표를 지울 렌더가 없으므로, 살아 있는
  // 화살표가 있으면 가장 이른 만료 시점에 한 번만 깨워 걷어낸다 (타이머 1개).
  const [shiftSweepTick, setShiftSweepTick] = useState(0);
  useEffect(() => {
    const shifts = Object.values(shiftById);
    if (!shifts.length) {
      return undefined;
    }
    const nowMs = Date.now();
    const visibleShifts = shifts.filter((shift) => isRankShiftVisibleAt(shift, nowMs));
    if (!visibleShifts.length) {
      return undefined;
    }
    const earliestExpiryMs = Math.min(
      ...visibleShifts.map((shift) => shift.bornAtMs + RANK_SHIFT_VISIBLE_MS),
    );
    const timer = setTimeout(
      () => setShiftSweepTick((tick) => tick + 1),
      Math.max(0, earliestExpiryMs - nowMs) + 60,
    );
    return () => clearTimeout(timer);
  }, [shiftById, shiftSweepTick]);

  const rows = useMemo<TowerListItem[]>(
    () => {
      const nowMs = Date.now();
      return participants.map((participant, index) => {
        const shift = shiftById[participant.id];
        return {
          participant,
          gapLabel: buildGroupGapLabel(participant, index > 0 ? participants[index - 1] : null),
          shiftDirection: shift && isRankShiftVisibleAt(shift, nowMs) ? shift.direction : null,
        };
      });
    },
    // shiftSweepTick: 시계 만료를 반영하기 위한 명시적 재계산 트리거 (본문 미참조가 의도).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participants, shiftById, shiftSweepTick],
  );

  const currentUserIndex = useMemo(
    () => participants.findIndex((participant) => participant.isCurrentUser),
    [participants],
  );

  // 나 중심이 켜져 있으면 내 줄 "순서"가 바뀔 때마다 가운데로 데려온다.
  // 매 거리 틱마다가 아니라 순위 변동 때만 스크롤해 사용자 제스처와 덜 싸운다.
  useEffect(() => {
    if (!centerOnMe || currentUserIndex < 0) {
      return;
    }
    listRef.current?.scrollToIndex({
      index: currentUserIndex,
      viewPosition: 0.5,
      animated: true,
    });
  }, [centerOnMe, currentUserIndex]);

  // 인원이 적으면 카드가 내용에 맞게 줄어든다 — 고정 432는 3~4명 방에서 아래가
  // 텅 비어 보였다 (적대 리뷰 2026-08-05). 행 수는 매치 중 불변(기권도 행 유지).
  const roadCardStyle = useMemo(
    () => [styles.roadCard, {
      height: Math.min(
        ROAD_HEIGHT_GROUP,
        TOWER_HEADER_HEIGHT + participants.length * TOWER_ROW_HEIGHT + 2 * TOWER_LIST_VERTICAL_INSET,
      ),
    }],
    [participants.length],
  );
  const renderItem = useCallback(({ item, index }: { item: TowerListItem; index: number }) => (
    <GroupTowerRow
      participant={item.participant}
      index={index}
      gapLabel={item.gapLabel}
      shiftDirection={item.shiftDirection}
    />
  ), []);
  const keyExtractor = useCallback((item: TowerListItem) => item.participant.id, []);
  const getItemLayout = useCallback((_: ArrayLike<TowerListItem> | null | undefined, index: number) => ({
    length: TOWER_ROW_HEIGHT,
    offset: TOWER_LIST_VERTICAL_INSET + TOWER_ROW_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={roadCardStyle}>
      <View style={styles.towerHeaderRow}>
        <Text style={styles.towerHeaderLabel}>순위 · 간격</Text>
        <Pressable
          style={styles.towerToggle}
          onPress={toggleCenterOnMe}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: centerOnMe }}
          accessibilityLabel="나 중심 보기"
          hitSlop={8}
        >
          <Feather
            name={centerOnMe ? 'check-square' : 'square'}
            size={16}
            color={centerOnMe ? colors.brandLighter : colors.lavenderSoft}
          />
          <Text style={centerOnMe ? styles.towerToggleLabelActive : styles.towerToggleLabel}>
            나 중심
          </Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        style={styles.groupScroll}
        contentContainerStyle={styles.towerScrollContent}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialScrollIndex={rows.length ? Math.min(Math.max(currentUserIndex, 0), rows.length - 1) : undefined}
        initialNumToRender={Platform.OS === 'android' ? 8 : 14}
        maxToRenderPerBatch={Platform.OS === 'android' ? 6 : 10}
        updateCellsBatchingPeriod={Platform.OS === 'android' ? 80 : 50}
        windowSize={Platform.OS === 'android' ? 5 : 9}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}, (prevProps, nextProps) => (
  areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
