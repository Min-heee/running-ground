// 혼자 러닝의 시작 영역 (오너 2026-07-31, 시안 L).
//
// 그냥 뛰기 / 페이스메이커 / 자신과 대결을 옆으로 넘기는 큰 카드 덱으로 둔다. 카드가 넓어서
// 각 모드가 무엇인지 한 줄로 설명되고, 첫 카드에 시작 버튼이 있어 진입 즉시 뛸 수 있다.
//
// 스냅: 카드 폭 + 간격 단위로 끊어 멈춘다. 폭을 화면에서 계산하는 이유는 기기 폭에 따라
// 다음 카드가 살짝 보이는 정도(피킹)를 유지하기 위해서다 — 그게 '옆에 더 있다'는 유일한
// 신호다. 인디케이터는 스크롤이 멈출 때만 갱신한다(프레임마다 setState 하면 이 탭 전체가
// 매 프레임 리렌더된다).

import { memo, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

// Screen의 좌우 여백(s16 × 2).
const SCREEN_HORIZONTAL_PADDING = 32;
const CARD_WIDTH_RATIO = 0.78;
const CARD_GAP = spacing.s10;

type SoloRunHeroPanelProps = {
  startLabel: string;
  startDisabled: boolean;
  onStart: () => void;
  onOpenPacemaker: () => void;
  onOpenGhostRun: () => void;
};

export const SoloRunHeroPanel = memo(function SoloRunHeroPanel({
  startLabel,
  startDisabled,
  onStart,
  onOpenPacemaker,
  onOpenGhostRun,
}: SoloRunHeroPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const cardWidth = useMemo(
    () => Math.round((windowWidth - SCREEN_HORIZONTAL_PADDING) * CARD_WIDTH_RATIO),
    [windowWidth],
  );
  const snapInterval = cardWidth + CARD_GAP;

  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo card deck' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    setActiveIndex(Math.max(0, Math.min(2, Math.round(offsetX / snapInterval))));
  }, [snapInterval]);

  const cards = useMemo(() => [
    {
      key: 'solo',
      badge: '기본',
      title: '그냥 뛰기',
      description: '거리와 페이스만 기록해요',
      actionLabel: startLabel,
      isPrimary: true,
      disabled: startDisabled,
      onPress: handleStart,
    },
    {
      key: 'pacemaker',
      badge: '음성 코칭',
      title: '페이스메이커',
      description: '목표 페이스를 귀로 알려줘요',
      actionLabel: '목표 정하기',
      isPrimary: false,
      disabled: false,
      onPress: onOpenPacemaker,
    },
    {
      key: 'ghost',
      badge: '고스트',
      title: '자신과 대결',
      description: '지난 기록을 옆에 두고 달려요',
      actionLabel: '기록 고르기',
      isPrimary: false,
      disabled: false,
      onPress: onOpenGhostRun,
    },
  ], [handleStart, onOpenGhostRun, onOpenPacemaker, startDisabled, startLabel]);

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        contentContainerStyle={styles.deck}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {cards.map((card) => (
          <SoloRunCard key={card.key} card={card} width={cardWidth} />
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {cards.map((card, index) => (
          <View
            key={card.key}
            style={[styles.dot, index === activeIndex ? styles.dotActive : undefined]}
          />
        ))}
      </View>
    </View>
  );
});

type SoloRunCardModel = {
  key: string;
  badge: string;
  title: string;
  description: string;
  actionLabel: string;
  isPrimary: boolean;
  disabled: boolean;
  onPress: () => void;
};

const SoloRunCard = memo(function SoloRunCard({
  card,
  width,
}: {
  card: SoloRunCardModel;
  width: number;
}) {
  return (
    <View style={[styles.card, card.isPrimary ? styles.cardPrimary : undefined, { width }]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{card.badge}</Text>
      </View>
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardDescription}>{card.description}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.cardAction,
          card.isPrimary ? styles.cardActionPrimary : styles.cardActionSecondary,
          card.disabled ? styles.cardActionDisabled : undefined,
          pressed && !card.disabled ? styles.cardActionPressed : undefined,
        ]}
        onPress={card.onPress}
        disabled={card.disabled}
        accessibilityRole="button"
        accessibilityLabel={`${card.title} — ${card.actionLabel}`}
      >
        <Text style={card.isPrimary ? styles.cardActionTextPrimary : styles.cardActionText}>
          {card.actionLabel}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.s12,
  },
  deck: {
    gap: CARD_GAP,
    // 마지막 카드도 끝까지 스냅되게 — 오른쪽 여백이 없으면 세 번째 카드가 화면 끝에 붙는다.
    paddingRight: spacing.s24,
  },
  card: {
    gap: spacing.xxl,
    padding: spacing.s16,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardPrimary: {
    borderColor: colors.brandSoftBorder,
    backgroundColor: colors.brandWash,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.display,
    fontWeight: fontWeights.extraBold,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    lineHeight: 20,
  },
  cardAction: {
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s16,
    borderRadius: radii.lg,
  },
  cardActionPrimary: {
    backgroundColor: fixedColors.brand,
  },
  cardActionSecondary: {
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
    backgroundColor: colors.surface,
  },
  cardActionPressed: {
    opacity: 0.9,
  },
  cardActionDisabled: {
    opacity: 0.6,
  },
  cardActionText: {
    color: colors.brandDeep,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  cardActionTextPrimary: {
    color: fixedColors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderMuted,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.brand,
  },
});
