import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 앱 공통 세그먼트 스위치 (오너 2026-08-04: 러닝탭 혼자/매칭/파티런 결로 통일).
// 흰 박스 + 활성 브랜드 솔리드 필 + 흰 글씨 — 선택 상태는 항상 고정 짝
// (fixedColors.brand + fixedColors.white)이어야 다크에서도 성립한다.
// 러닝탭(MatchOptionSelector)·랭킹탭(LeagueModeSwitch)·친구탭(FriendsRanking)이 공유.

export type SegmentSwitchItem = {
  id: string;
  label: string;
};

type SegmentSwitchProps = {
  items: readonly SegmentSwitchItem[];
  activeId: string;
  onSelect: (id: string) => void;
  // 'field'(기본) = 회색 앱 필드 위 흰 박스. 'card' = 흰 카드 **안**에 앉을 때 —
  // 흰-위-흰이라 트랙이 사라지고 다크에선 유리 보더가 이중이 되므로,
  // 카드 내부 요소 결(회색 필 + 무보더)로 바꾼다. 활성 상태 언어는 동일.
  variant?: 'field' | 'card';
};

const SegmentTab = memo(function SegmentTab({
  isActive,
  label,
  onPress,
  segmentId,
}: {
  isActive: boolean;
  label: string;
  onPress: (segmentId: string) => void;
  segmentId: string;
}) {
  const tabStyle = useMemo(() => [
    styles.segmentTab,
    isActive ? styles.segmentTabActive : undefined,
  ], [isActive]);
  const labelStyle = useMemo(() => [
    styles.segmentLabel,
    isActive ? styles.segmentLabelActive : undefined,
  ], [isActive]);
  const handlePress = useCallback(() => onPress(segmentId), [onPress, segmentId]);

  return (
    <Pressable
      style={tabStyle}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
});

export function SegmentSwitch({ items, activeId, onSelect, variant = 'field' }: SegmentSwitchProps) {
  return (
    <View
      style={[styles.segmentRow, variant === 'card' ? styles.segmentRowOnCard : undefined]}
      accessibilityRole="tablist"
    >
      {items.map((item) => (
        <SegmentTab
          key={item.id}
          isActive={item.id === activeId}
          label={item.label}
          onPress={onSelect}
          segmentId={item.id}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    backgroundColor: colors.surface,
  },
  segmentRowOnCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: 'transparent',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: spacing.s10,
    // 바깥 라운드(18) - 인셋(4) = 14. 안쪽 모서리가 바깥과 어긋나 보이지 않게.
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    backgroundColor: fixedColors.brand,
  },
  segmentLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.bold,
  },
  segmentLabelActive: {
    color: fixedColors.white,
    fontWeight: fontWeights.extraBold,
  },
});
