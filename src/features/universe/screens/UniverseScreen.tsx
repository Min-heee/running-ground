import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Feather } from '@expo/vector-icons';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { StateMessageCard } from '@/components/ui/StateMessageCard';
import {
  UniverseScene,
  type SceneBody,
  type UniverseSceneControls,
} from '@/features/universe/components/UniverseScene';
import { StarBirthOverlay } from '@/features/universe/components/StarBirthOverlay';
import { useStarBirth } from '@/features/universe/hooks/useStarBirth';
import { useUniverseTree } from '@/features/universe/hooks/useUniverseTree';
import {
  UNIVERSE_SEARCH_MIN_LENGTH,
  useUniverseSearch,
} from '@/features/universe/hooks/useUniverseSearch';
import type { UniverseSearchResult } from '@/lib/api/types';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { readPerf, type PerfSnapshot } from '@/features/universe/three/perfProbe';
import { runSpaceWarmup } from '@/features/universe/three/warmup';

// 성능 계측 표시 — 제목을 **길게 누르면** 켜진다. 실기기에서만 알 수 있는 숫자를 오너가
// 직접 읽어 보내 줄 수 있게 두는 임시 창구다(개발 브라우저는 탭이 가려지면 프레임 루프가
// 얼어서 측정이 통째로 오염된다). 켜지 않으면 존재하지 않는 것과 같다.
function PerfHud() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setSnapshot(readPerf()), 500);
    return () => clearInterval(timer);
  }, []);

  if (!snapshot) {
    return null;
  }

  return (
    <View style={styles.perfHud} pointerEvents="none">
      <Text style={styles.perfText}>
        {`${snapshot.fps}fps · 최악 ${snapshot.worstMs}ms`}
      </Text>
      <Text style={styles.perfText}>
        {`천체 ${snapshot.bodies} · 원반 ${snapshot.disks}`}
      </Text>
      <Text style={styles.perfText}>
        {`${snapshot.megaPixels}MP · dpr ${snapshot.dpr}`}
      </Text>
    </View>
  );
}

// 우주는 테마와 무관하게 항상 어둡다 — 라이트 모드라고 흰 우주를 그릴 수는 없어서, 이
// 화면만 고정 우주색을 쓴다 (다른 탭은 colors 토큰을 그대로 따른다).
const SPACE_BACKGROUND = '#05060F';

export default function UniverseScreen() {
  useTabWarmupTrace('universe');
  const tree = useUniverseTree();
  const search = useUniverseSearch();
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<SceneBody | null>(null);
  const [focused, setFocused] = useState<SceneBody | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  // 진입 준비 — 처음 한 번 치르는 비용(텍스처 굽기·원반 만들기·셰이더 첫 컴파일)을 로딩
  // 뒤에서 끝낸다. 예전엔 그게 사용자의 첫 확대 밑에서 터졌다(오너 2026-08-23).
  const [warming, setWarming] = useState(true);

  useEffect(() => {
    const handle = runSpaceWarmup(() => setWarming(false));
    return handle.cancel;
  }, []);
  // 장면이 좌표 계산을 맡는다 — 화면은 "이 경로로 데려가 줘"라고만 부탁한다.
  const controlsRef = useRef<UniverseSceneControls | null>(null);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvas((previous) => (previous.width === width && previous.height === height
      ? previous
      : { width, height }));
  }, []);

  // 콜드 로드에서 onLayout이 영영 안 오는 일이 있다(웹 — 첫 레이아웃 관찰을 놓치는
  // 레이스). 그러면 캔버스가 0×0에 갇혀 우주가 통째로 검은 화면이 된다. 잠깐 뒤에도
  // 0×0이면 직접 잰다 — onLayout이 정상 동작한 뒤에는 아무 일도 하지 않는다.
  const canvasWrapRef = useRef<View | null>(null);

  useEffect(() => {
    const probe = () => {
      canvasWrapRef.current?.measure?.((_x, _y, width, height) => {
        if (width > 0 && height > 0) {
          setCanvas((previous) => (previous.width > 0 && previous.height > 0
            ? previous
            : { width, height }));
        }
      });
    };
    const timers = [300, 1200, 3000, 6000].map((delay) => setTimeout(probe, delay));

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  // 목적지의 좌표는 조상이 전부 있어야 나온다 — 먼저 사슬을 채우고 나서 날아간다.
  //
  // 한 번 더 시도하는 이유: 사슬을 채우는 동안 장면이 다시 그려지면서 방금 도착한 자식들이
  // 반영되기까지 한 프레임이 걸릴 수 있다. 첫 시도가 좌표를 못 만들면(false) 그 프레임을
  // 기다렸다 한 번만 더 부른다 — 실패를 삼키면 버튼이 아무 반응 없는 것처럼 보인다.
  const flyTo = useCallback(async (nodeId: string, userId?: string) => {
    const path = await tree.ensurePath(nodeId);

    if (!path) {
      return;
    }

    if (controlsRef.current?.flyTo(path, userId)) {
      return;
    }

    requestAnimationFrame(() => {
      controlsRef.current?.flyTo(path, userId);
    });
  }, [tree]);

  const handleSelectSearchResult = useCallback((result: UniverseSearchResult) => {
    search.clear();
    void flyTo(result.galaxyNodeId, result.userId);
  }, [flyTo, search]);

  const handleWarp = useCallback(() => {
    const galaxyNodeId = tree.me?.galaxyNodeId;

    if (galaxyNodeId) {
      void flyTo(galaxyNodeId, tree.me?.userId);
    }
  }, [flyTo, tree.me]);

  // 처음 여는 사람에게는 별이 만들어지는 걸 보여주고, 연출이 끝나면 그 별 앞에 내려놓는다.
  const starBirth = useStarBirth({
    userId: tree.me?.userId,
    hasGalaxy: Boolean(tree.me?.galaxyNodeId),
  });

  const handleBirthDone = useCallback(() => {
    starBirth.finish();
    handleWarp();
  }, [handleWarp, starBirth]);

  // 탭바를 숨긴 화면의 유일한 출구. 왔던 곳으로 돌려보내되, 히스토리가 없으면(딥링크·
  // 알림으로 바로 들어온 경우) 홈으로 — 어느 쪽이든 갇히지 않는다.
  const handleExit = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/home');
  }, []);

  const handleResetView = useCallback(() => {
    setSelected(null);
    controlsRef.current?.reset();
  }, []);

  const hasCanvas = canvas.width > 0 && canvas.height > 0;
  // 아래 카드는 고른 것을 먼저 보여주고, 아무것도 안 골랐으면 지금 화면 한가운데의 것을 보여준다.
  const shown = selected ?? focused;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Pressable
              onPress={handleExit}
              hitSlop={12}
              style={styles.exitButton}
              accessibilityRole="button"
              accessibilityLabel="스페이스 나가기"
            >
              <Feather name="x" size={18} color="rgba(214, 228, 255, 0.95)" />
            </Pressable>
            <Text
              style={styles.title}
              onLongPress={() => setShowPerf((shown) => !shown)}
              suppressHighlighting
            >
              스페이스
            </Text>
          </View>
          <View style={styles.headerActions}>
            {/* 끌다가 우주 밖으로 나가면 돌아올 길이 이것뿐이다 — 그래서 항상 떠 있다. */}
            <Pressable onPress={handleResetView} hitSlop={8} style={styles.ghostButton}>
              <Text style={styles.ghostLabel}>전체 보기</Text>
            </Pressable>
            {tree.me?.galaxyNodeId ? (
              <Pressable onPress={handleWarp} hitSlop={8} style={styles.warpButton}>
                <Text style={styles.warpLabel}>내 행성으로</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={search.query}
          onChangeText={search.setQuery}
          placeholder="러너 이름으로 찾기"
          placeholderTextColor="rgba(150, 170, 210, 0.6)"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.query.length > 0 ? (
          <Pressable onPress={search.clear} hitSlop={10} style={styles.searchClear}>
            <Text style={styles.searchClearLabel}>지우기</Text>
          </Pressable>
        ) : null}
      </View>

      {search.query.trim().length >= UNIVERSE_SEARCH_MIN_LENGTH ? (
        <View style={styles.searchPanel}>
          {search.error ? (
            <Text style={styles.searchNotice}>{search.error}</Text>
          ) : search.results.length === 0 ? (
            <Text style={styles.searchNotice}>
              {search.searching ? '찾는 중…' : '그런 이름의 러너가 없어요'}
            </Text>
          ) : (
            <ScrollView style={styles.searchList} keyboardShouldPersistTaps="handled">
              {search.results.map((result) => (
                <Pressable
                  key={result.userId}
                  onPress={() => handleSelectSearchResult(result)}
                  style={styles.searchItem}
                >
                  <Text style={styles.searchName} numberOfLines={1}>
                    {result.userName}
                    {result.isMine ? ' · 나' : ''}
                  </Text>
                  <Text style={styles.searchMeta} numberOfLines={1}>
                    {result.regionPath} · 이번 달 {result.monthDistanceKm}km
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      <View ref={canvasWrapRef} style={styles.canvasWrap} onLayout={handleCanvasLayout}>
        {!tree.loading && tree.error ? (
          <View style={styles.errorWrap}>
            <StateMessageCard
              title="스페이스를 열지 못했어요"
              message={tree.error}
              actionLabel="다시 시도"
              onAction={tree.retry}
              tone="danger"
            />
          </View>
        ) : null}

        {/* 준비가 끝나기 전에도 장면은 **마운트해 둔다** — 그래야 그 시간 동안 원반이
            만들어지고 셰이더가 컴파일된다. 로딩 화면이 그 위를 덮고 있을 뿐이다. */}
        {!tree.loading && !tree.error && hasCanvas ? (
          <UniverseScene
            rootId={tree.rootId}
            entryFor={tree.entryFor}
            request={tree.request}
            revision={tree.revision}
            width={canvas.width}
            height={canvas.height}
            selectedKey={selected?.key ?? null}
            onSelect={setSelected}
            onFocusChange={setFocused}
            controlsRef={controlsRef}
          />
        ) : null}

        {/* 로딩은 **장면 위에** 온다 — 형제 순서가 곧 위아래라, 먼저 그리면 장면에 덮인다.
            반드시 화면 전체를 덮고 터치를 삼켜야 한다 (2026-08-26 사고: 로고만 떠 있고
            캔버스가 노출돼 홀드 중에도 줌이 됐다 — 굽는 중의 조작은 베이크를 전부 손가락
            밑에서 터뜨린다). pointerEvents 기본값(auto)이 차단막 역할을 한다. 에러가 뜨면 차단막을 내린다 —
            '다시 시도' 버튼이 워밍업 10초 동안 가려지면 안 된다(적대 검증). */}
        {(tree.loading || warming) && !tree.error ? (
          <View style={styles.loadingShield}>
            <BrandLoadingView style={styles.loading} edges={[]} />
          </View>
        ) : null}

        {starBirth.showing ? <StarBirthOverlay onDone={handleBirthDone} /> : null}

        {showPerf ? <PerfHud /> : null}
      </View>

      <View style={styles.footer}>
        {shown ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoName} numberOfLines={1}>
                {shown.name}
              </Text>
              {shown.planet?.isStar ? <Text style={styles.infoBadge}>항성</Text> : null}
            </View>
            <Text style={styles.infoMetrics}>
              {shown.planet
                ? `평생 ${shown.planet.lifetimeDistanceKm}km · 이번 달 ${shown.planet.monthDistanceKm}km`
                : shown.detail}
            </Text>
          </View>
        ) : null}

        <Text style={styles.hint}>
          확대하면 뭉쳐 있던 별이 풀려요 · 천체를 누르면 기록, 한 번 더 누르면 그리로 갑니다
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: SPACE_BACKGROUND,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  perfHud: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(4, 6, 14, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(150, 180, 255, 0.35)',
  },
  perfText: {
    color: 'rgba(214, 228, 255, 0.95)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exitButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(150, 180, 255, 0.4)',
    backgroundColor: 'rgba(90, 130, 220, 0.14)',
  },
  title: {
    color: 'rgba(242, 246, 255, 0.98)',
    fontSize: 24,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostLabel: {
    color: 'rgba(158, 186, 240, 0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  warpButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(150, 180, 255, 0.5)',
    backgroundColor: 'rgba(90, 130, 220, 0.16)',
  },
  warpLabel: {
    color: 'rgba(214, 228, 255, 0.95)',
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchInput: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(122, 152, 220, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(140, 170, 235, 0.22)',
    color: 'rgba(240, 246, 255, 0.98)',
    fontSize: 13,
  },
  searchClear: {
    paddingHorizontal: 4,
  },
  searchClearLabel: {
    color: 'rgba(158, 186, 240, 0.9)',
    fontSize: 12,
  },
  // 캔버스 위에 겹치지 않고 그 위쪽에 자리를 차지한다 — 목록을 스크롤하다 우주를
  // 끌어버리는 제스처 충돌을 원천에서 없앤다.
  searchPanel: {
    marginTop: 6,
    marginHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(18, 24, 44, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(140, 170, 235, 0.22)',
    overflow: 'hidden',
  },
  searchList: {
    maxHeight: 208,
  },
  searchItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  searchName: {
    color: 'rgba(240, 246, 255, 0.98)',
    fontSize: 14,
    fontWeight: '600',
  },
  searchMeta: {
    color: 'rgba(170, 190, 225, 0.78)',
    fontSize: 11,
  },
  searchNotice: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: 'rgba(170, 190, 225, 0.78)',
    fontSize: 12,
  },
  canvasWrap: {
    flex: 1,
    marginTop: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingShield: {
    ...StyleSheet.absoluteFillObject,
    // 장면이 은은히 비치되 '로딩 중'이 확실히 읽히게 — 그리고 이 배경이 터치를 삼킨다.
    backgroundColor: 'rgba(5, 9, 22, 0.72)',
  },
  errorWrap: {
    paddingHorizontal: 16,
    width: '100%',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  infoCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(122, 152, 220, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(140, 170, 235, 0.22)',
    gap: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoName: {
    color: 'rgba(240, 246, 255, 0.98)',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  infoBadge: {
    color: 'rgba(255, 214, 122, 0.98)',
    fontSize: 11,
    fontWeight: '700',
  },
  infoMetrics: {
    color: 'rgba(186, 204, 238, 0.86)',
    fontSize: 12,
  },
  hint: {
    color: 'rgba(150, 170, 210, 0.66)',
    fontSize: 11,
    textAlign: 'center',
  },
});
