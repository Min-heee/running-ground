import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
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
import { ConstellationView } from '@/features/universe/components/ConstellationView';
import { GalaxyView } from '@/features/universe/components/GalaxyView';
import { useUniverse } from '@/features/universe/hooks/useUniverse';
import {
  UNIVERSE_SEARCH_MIN_LENGTH,
  useUniverseSearch,
} from '@/features/universe/hooks/useUniverseSearch';
import type { UniverseBody, UniversePlanet, UniverseSearchResult } from '@/lib/api/types';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';

// 우주는 테마와 무관하게 항상 어둡다 — 라이트 모드라고 흰 우주를 그릴 수는 없어서, 이
// 화면만 고정 우주색을 쓴다 (다른 탭은 colors 토큰을 그대로 따른다).
const SPACE_BACKGROUND = '#05060F';

export default function UniverseScreen() {
  useTabWarmupTrace('universe');
  const {
    universe,
    loading,
    error,
    breadcrumb,
    canGoBack,
    openNode,
    goBack,
    warpToMyGalaxy,
    retry,
  } = useUniverse();
  const search = useUniverseSearch();
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  // 선택은 '어느 은하에서 고른 것인지'와 함께 들고 있는다. 층이 바뀔 때 effect로 비우면,
  // 검색 착지가 자식 effect에서 고른 행성을 부모 effect가 곧바로 지워버린다(자식 → 부모 순).
  const [selection, setSelection] = useState<{ nodeId?: string; planet: UniversePlanet } | null>(null);
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  const currentNodeId = universe?.node.id;
  const selectedPlanet = selection && selection.nodeId === currentNodeId ? selection.planet : null;

  // 안드로이드 물리 뒤로가기 = 한 층 줌아웃. 최상위(은하단)에서는 앱 기본 동작에 넘긴다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => goBack());

    return () => subscription.remove();
  }, [goBack]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvas((previous) => (previous.width === width && previous.height === height
      ? previous
      : { width, height }));
  }, []);

  const handleSelectBody = useCallback((body: UniverseBody) => {
    openNode(body.id);
  }, [openNode]);

  // 축소로 한 층 나가기 — 물리 뒤로가기와 완전히 같은 경로를 쓴다(되돌아갈 곳의 정의가
  // 두 벌이 되면 브레드크럼과 화면이 어긋난다).
  const handleAscend = useCallback(() => {
    goBack();
  }, [goBack]);

  const handleSelectPlanet = useCallback((planet: UniversePlanet) => {
    setSelection((previous) => (previous?.planet.userId === planet.userId && previous.nodeId === currentNodeId
      ? null
      : { nodeId: currentNodeId, planet }));
  }, [currentNodeId]);

  const handleFocusHandled = useCallback(() => setFocusUserId(null), []);

  // 검색 결과 착지 — 그 사람의 은하를 열고, 그 안에서 행성을 조준하게 표시를 남긴다.
  const handleSelectSearchResult = useCallback((result: UniverseSearchResult) => {
    setFocusUserId(result.userId);
    search.clear();
    openNode(result.galaxyNodeId);
  }, [openNode, search]);

  const hasCanvas = canvas.width > 0 && canvas.height > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>우주</Text>
          {universe?.me.galaxyNodeId ? (
            <Pressable onPress={warpToMyGalaxy} hitSlop={8} style={styles.warpButton}>
              <Text style={styles.warpLabel}>내 행성으로</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.breadcrumbRow}>
          {breadcrumb.map((node, index) => (
            <View key={node.id} style={styles.breadcrumbItem}>
              {index > 0 ? <Text style={styles.breadcrumbSeparator}>›</Text> : null}
              <Pressable onPress={() => openNode(index === 0 ? undefined : node.id)} hitSlop={6}>
                <Text
                  style={index === breadcrumb.length - 1 ? styles.breadcrumbCurrent : styles.breadcrumbLink}
                  numberOfLines={1}
                >
                  {node.name}
                </Text>
              </Pressable>
            </View>
          ))}
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
        {loading ? <BrandLoadingView style={styles.loading} edges={[]} /> : null}

        {!loading && error ? (
          <View style={styles.errorWrap}>
            <StateMessageCard
              title="우주를 열지 못했어요"
              message={error}
              actionLabel="다시 시도"
              onAction={retry}
              tone="danger"
            />
          </View>
        ) : null}

        {!loading && !error && universe && hasCanvas ? (
          universe.level === 'galaxy' && universe.galaxy ? (
            <GalaxyView
              galaxy={universe.galaxy}
              width={canvas.width}
              height={canvas.height}
              onSelectPlanet={handleSelectPlanet}
              onAscend={canGoBack ? handleAscend : undefined}
              focusUserId={focusUserId}
              onFocusHandled={handleFocusHandled}
              selectedUserId={selectedPlanet?.userId ?? null}
            />
          ) : (
            <ConstellationView
              bodies={universe.bodies}
              width={canvas.width}
              height={canvas.height}
              onSelect={handleSelectBody}
              onAscend={canGoBack ? handleAscend : undefined}
            />
          )
        ) : null}
      </View>

      <View style={styles.footer}>
        {selectedPlanet ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoName} numberOfLines={1}>
                {selectedPlanet.userName}
                {selectedPlanet.stars > 0 ? ` ★${selectedPlanet.stars}` : ''}
              </Text>
              {selectedPlanet.isStar ? <Text style={styles.infoBadge}>항성</Text> : null}
              {selectedPlanet.isProtostar ? <Text style={styles.infoBadge}>이번 달 1등</Text> : null}
            </View>
            <Text style={styles.infoMetrics}>
              평생 {selectedPlanet.lifetimeDistanceKm}km · 이번 달 {selectedPlanet.monthDistanceKm}km
            </Text>
          </View>
        ) : universe ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoName} numberOfLines={1}>
              {universe.node.name}
              {universe.node.stars > 0 ? ` ★${universe.node.stars}` : ''}
            </Text>
            <Text style={styles.infoMetrics}>
              러너 {universe.node.memberCount}명 · 이번 달 {universe.node.totalDistanceKm}km · 인당 {universe.node.averageDistanceKm}km
            </Text>
          </View>
        ) : null}

        <Text style={styles.hint}>
          {universe?.level === 'galaxy'
            ? '행성을 누르면 기록이 보여요'
            : canGoBack
              ? '천체를 누르면 들어가고, 뒤로가기로 나와요'
              : '천체를 누르면 그 안으로 들어가요'}
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
    gap: 6,
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
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbSeparator: {
    color: 'rgba(150, 170, 210, 0.6)',
    fontSize: 13,
    paddingHorizontal: 6,
  },
  breadcrumbLink: {
    color: 'rgba(158, 186, 240, 0.9)',
    fontSize: 13,
  },
  breadcrumbCurrent: {
    color: 'rgba(238, 244, 255, 0.98)',
    fontSize: 13,
    fontWeight: '700',
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
