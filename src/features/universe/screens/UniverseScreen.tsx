import { useCallback, useRef, useState } from 'react';
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
  // 장면이 좌표 계산을 맡는다 — 화면은 "이 경로로 데려가 줘"라고만 부탁한다.
  const controlsRef = useRef<UniverseSceneControls | null>(null);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvas((previous) => (previous.width === width && previous.height === height
      ? previous
      : { width, height }));
  }, []);

  // 목적지의 좌표는 조상이 전부 있어야 나온다 — 먼저 사슬을 채우고 나서 날아간다.
  const flyTo = useCallback(async (nodeId: string, userId?: string) => {
    const path = await tree.ensurePath(nodeId);

    if (path) {
      controlsRef.current?.flyTo(path, userId);
    }
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

  const handleResetView = useCallback(() => {
    setSelected(null);
    controlsRef.current?.reset();
  }, []);

  const hasCanvas = canvas.width > 0 && canvas.height > 0;
  // 아래 카드는 고른 것을 먼저 보여주고, 아무것도 안 골랐으면 지금 화면 한가운데의 것을 보여준다.
  const shown = selected ?? focused;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>우주</Text>
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

      <View style={styles.canvasWrap} onLayout={handleCanvasLayout}>
        {tree.loading ? <BrandLoadingView style={styles.loading} edges={[]} /> : null}

        {!tree.loading && tree.error ? (
          <View style={styles.errorWrap}>
            <StateMessageCard
              title="우주를 열지 못했어요"
              message={tree.error}
              actionLabel="다시 시도"
              onAction={tree.retry}
              tone="danger"
            />
          </View>
        ) : null}

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

        {starBirth.showing ? <StarBirthOverlay onDone={handleBirthDone} /> : null}
      </View>

      <View style={styles.footer}>
        {shown ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoName} numberOfLines={1}>
                {shown.name}
                {shown.stars > 0 ? ` ★${shown.stars}` : ''}
              </Text>
              {shown.planet?.isStar ? <Text style={styles.infoBadge}>항성</Text> : null}
              {shown.planet?.isProtostar ? <Text style={styles.infoBadge}>이번 달 1등</Text> : null}
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
    backgroundColor: 'transparent',
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
