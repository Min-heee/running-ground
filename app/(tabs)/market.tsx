import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { claimMarketItem, fetchMarketOverview } from '@/lib/api/services';
import { MarketOverviewResponse } from '@/lib/api/types';

const MARKET_THEME_ORDER = ['런닝화', '런닝 바지', '런닝 티', '러닝 용품', '키프티콘'] as const;

export default function MarketScreen() {
  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const loadMarket = () => {
    setLoading(true);
    setError(null);

    fetchMarketOverview()
      .then((data) => setOverview(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '마켓 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMarket();
  }, []);

  const handleClaim = async (itemId: string) => {
    setClaimingItemId(itemId);
    setClaimMessage(null);
    setClaimError(null);

    try {
      const result = await claimMarketItem(itemId);
      setOverview(result.overview);
      const claimedItem = result.overview.items.find((item) => item.id === result.claimedItemId);
      setClaimMessage(claimedItem ? `${claimedItem.title} 교환이 완료됐어.` : '리워드 교환이 완료됐어.');
    } catch (nextError) {
      setClaimError(nextError instanceof Error ? nextError.message : '리워드 교환에 실패했어.');
    } finally {
      setClaimingItemId(null);
    }
  };

  const categories = useMemo(() => {
    const names = Array.from(new Set((overview?.items ?? []).map((item) => item.category)));

    return names.sort((left, right) => {
      const leftIndex = MARKET_THEME_ORDER.indexOf(left as (typeof MARKET_THEME_ORDER)[number]);
      const rightIndex = MARKET_THEME_ORDER.indexOf(right as (typeof MARKET_THEME_ORDER)[number]);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right, 'ko');
      }

      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    });
  }, [overview]);

  const activeCategory = selectedCategory || categories[0] || '';

  useEffect(() => {
    if (!categories.length) {
      return;
    }

    if (!selectedCategory || !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  const visibleItems = useMemo(() => {
    const items = overview?.items ?? [];
    const filteredItems = activeCategory ? items.filter((item) => item.category === activeCategory) : items;

    return [...filteredItems].sort((left, right) => {
      const claimPriority = { claimable: 0, claimed: 1, locked: 2 } satisfies Record<string, number>;
      const stateDiff = claimPriority[left.claimState] - claimPriority[right.claimState];

      if (stateDiff !== 0) {
        return stateDiff;
      }

      if (left.costPoints !== right.costPoints) {
        return left.costPoints - right.costPoints;
      }

      return left.title.localeCompare(right.title, 'ko');
    });
  }, [activeCategory, overview]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>마켓</Text>
        {overview ? (
          <View style={styles.pointsStack}>
            <View style={styles.pointsBadge}>
              <View style={styles.pointsIcon}>
                <Text style={styles.pointsIconText}>P</Text>
              </View>
              <Text style={styles.pointsValue}>{overview.currentPoints}P</Text>
            </View>
            <Pressable style={styles.historyButton}>
              <Text style={styles.historyButtonText}>교환 내역</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading && error ? (
        <Card>
          <Text style={styles.stateTitle}>마켓을 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadMarket} />
        </Card>
      ) : null}

      {overview ? (
        <>
          <Card>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>테마별 상품</Text>
              <Text style={styles.sectionCount}>{visibleItems.length}개</Text>
            </View>

            <View style={styles.themeChipList}>
              {categories.map((category) => {
                const selected = category === activeCategory;

                return (
                  <Pressable
                    key={category}
                    style={[styles.themeChip, selected && styles.themeChipSelected]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text style={[styles.themeChipText, selected && styles.themeChipTextSelected]}>{category}</Text>
                  </Pressable>
                );
              })}
            </View>

            {visibleItems.length > 0 ? (
              <View style={styles.rewardCardList}>
                {visibleItems.map((item) => (
                  <MarketItemRow
                    key={item.id}
                    item={item}
                    disabled={claimingItemId === item.id}
                    onPress={() => handleClaim(item.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>이 테마에 준비된 상품이 아직 없어.</Text>
            )}

            {claimMessage ? <Text style={styles.successText}>{claimMessage}</Text> : null}
            {claimError ? <Text style={styles.errorText}>{claimError}</Text> : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function MarketItemRow({
  item,
  disabled = false,
  onPress,
}: {
  item: MarketOverviewResponse['items'][number];
  disabled?: boolean;
  onPress?: () => void;
}) {
  const isClaimable = item.claimState === 'claimable';
  const isClaimed = item.claimState === 'claimed';
  const buttonLabel = isClaimed ? '교환 완료' : isClaimable ? (disabled ? '교환 중...' : '교환하기') : '잠김';

  return (
    <View style={styles.productCard}>
      <View style={styles.productHeader}>
        <View style={styles.productTitleWrap}>
          <Text style={styles.productTitle}>{item.title}</Text>
          <Text style={styles.productMeta}>
            {item.partnerName ? `${item.partnerName} · ` : ''}
            {item.repeatable ? '반복 교환 가능' : '1회 교환'}
          </Text>
        </View>
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>{item.costPoints}P</Text>
        </View>
      </View>

      <Text style={styles.productDescription}>{item.description}</Text>

      <View style={styles.productFooter}>
        <Pressable
          style={[
            styles.productButton,
            isClaimed && styles.productButtonClaimed,
            !isClaimable && !isClaimed && styles.productButtonLocked,
            disabled && styles.productButtonDisabled,
          ]}
          onPress={onPress}
          disabled={!isClaimable || disabled}
        >
          <Text
            style={[
              styles.productButtonText,
              isClaimed && styles.productButtonTextClaimed,
              !isClaimable && !isClaimed && styles.productButtonTextLocked,
              disabled && styles.productButtonTextDisabled,
            ]}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#101828',
  },
  pointsStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pointsIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsIconText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    includeFontPadding: false,
  },
  pointsValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  historyButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyButtonText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  themeChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  themeChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  themeChipText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
  },
  themeChipTextSelected: {
    color: '#FFFFFF',
  },
  rewardCardList: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  productTitleWrap: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  productMeta: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  pricePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pricePillText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  productDescription: {
    color: '#667085',
    lineHeight: 20,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  productButton: {
    minWidth: 96,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  productButtonClaimed: {
    backgroundColor: '#ECFDF3',
  },
  productButtonLocked: {
    backgroundColor: '#F3F4F6',
  },
  productButtonDisabled: {
    opacity: 0.7,
  },
  productButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  productButtonTextClaimed: {
    color: '#067647',
  },
  productButtonTextLocked: {
    color: '#667085',
  },
  productButtonTextDisabled: {
    opacity: 0.8,
  },
  successText: {
    color: '#067647',
    fontWeight: '700',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
});
