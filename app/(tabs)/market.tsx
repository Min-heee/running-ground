import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MarketOverviewResponse } from '@/lib/api/types';
import { claimMarketItem, fetchMarketOverview } from '@/lib/api/services';

export default function MarketScreen() {
  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

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

  const claimableItems = overview?.items.filter((item) => item.claimState === 'claimable') ?? [];
  const lockedItems = overview?.items.filter((item) => item.claimState === 'locked') ?? [];
  const claimedItems = overview?.items.filter((item) => item.claimState === 'claimed') ?? [];
  const nextUnlockItem = lockedItems[0] ?? null;

  return (
    <Screen>
      <PageHeader title="마켓" subtitle="달리면서 쌓은 포인트를 실제 보상과 프로필 꾸미기로 이어주는 공간." />

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
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>현재 교환 가능 포인트</Text>
            <Text style={styles.balanceValue}>{overview.currentPoints}P</Text>
            <Text style={styles.balanceMeta}>지금까지 받은 리워드 {overview.totalRedeemedCount}개</Text>
          </Card>

          <InfoCard title="이번 주 추천">
            {nextUnlockItem
              ? `${nextUnlockItem.title}까지 ${Math.max(0, nextUnlockItem.costPoints - overview.currentPoints)}P 남았어. 먼저 교환 가능한 보상부터 챙기고 다음 주 목표를 잡아보자.`
              : '지금 보이는 리워드는 모두 교환 가능한 상태야. 마음에 드는 보상부터 바로 가져가면 돼.'}
          </InfoCard>

          <Card>
            <Text style={styles.sectionTitle}>지금 바로 교환 가능</Text>
            {claimableItems.map((item) => (
              <RewardRow
                key={item.id}
                item={item}
                actionLabel={claimingItemId === item.id ? '교환 중...' : '교환하기'}
                disabled={claimingItemId === item.id}
                onPress={() => handleClaim(item.id)}
              />
            ))}
            {claimableItems.length === 0 ? <Text style={styles.emptyText}>지금 바로 교환 가능한 리워드는 아직 없어.</Text> : null}
            {claimMessage ? <Text style={styles.successText}>{claimMessage}</Text> : null}
            {claimError ? <Text style={styles.errorText}>{claimError}</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>조금만 더 모으면 열려</Text>
            {lockedItems.map((item) => (
              <RewardRow
                key={item.id}
                item={item}
                actionLabel={`${item.costPoints}P 필요`}
                disabled
              />
            ))}
            {lockedItems.length === 0 ? <Text style={styles.emptyText}>잠겨 있는 리워드는 지금 없어.</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>이미 받은 리워드</Text>
            {claimedItems.map((item) => (
              <RewardRow
                key={item.id}
                item={item}
                actionLabel="보유 중"
                disabled
              />
            ))}
            {claimedItems.length === 0 ? <Text style={styles.emptyText}>아직 교환한 리워드는 없어.</Text> : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function RewardRow({
  item,
  actionLabel,
  disabled = false,
  onPress,
}: {
  item: MarketOverviewResponse['items'][number];
  actionLabel: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={styles.rewardRow}>
      <View style={styles.rewardMeta}>
        <View style={styles.rewardHeading}>
          <Text style={styles.rewardTitle}>{item.title}</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        </View>
        <Text style={styles.rewardDescription}>{item.description}</Text>
        <Text style={styles.rewardCost}>
          {item.costPoints}P
          {item.partnerName ? ` · ${item.partnerName}` : ''}
        </Text>
      </View>
      <Pressable style={[styles.rewardButton, disabled && styles.rewardButtonDisabled]} onPress={onPress} disabled={disabled}>
        <Text style={[styles.rewardButtonText, disabled && styles.rewardButtonTextDisabled]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  balanceLabel: {
    color: '#475467',
    fontWeight: '700',
  },
  balanceValue: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '900',
  },
  balanceMeta: {
    color: '#667085',
    lineHeight: 20,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  rewardMeta: {
    flex: 1,
    gap: 6,
  },
  rewardHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  rewardTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  categoryBadge: {
    backgroundColor: '#F2F4F7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
  },
  rewardDescription: {
    color: '#667085',
    lineHeight: 20,
  },
  rewardCost: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  rewardButton: {
    minWidth: 84,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rewardButtonDisabled: {
    backgroundColor: '#EAECF0',
  },
  rewardButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  rewardButtonTextDisabled: {
    color: '#667085',
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
