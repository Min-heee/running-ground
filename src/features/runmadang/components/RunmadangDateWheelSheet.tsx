import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  buildDateKey,
  buildDateWheelRanges,
  clampDateKeyToRange,
  getDateKeyParts,
} from '../runmadangModel';

// 그라운드 시작일/종료일 피커 (오너 2026-08-07): 년/월/일 세 휠을 따로 스크롤.
// 휠 메커니즘(48px 스냅, 선택 밴드, 페이드)은 RunPeriodPickerSheet와 같은 결.

type RunmadangDateWheelSheetProps = {
  visible: boolean;
  title: string;
  minKey: string;
  maxKey: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
};

const ITEM_HEIGHT = 48;
const VISIBLE_ITEM_COUNT = 5;
const WHEEL_VERTICAL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEM_COUNT / 2);

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}

type WheelProps = {
  values: number[];
  selectedValue: number;
  suffix: string;
  onChange: (value: number) => void;
};

function Wheel({ values, selectedValue, suffix, onChange }: WheelProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const selectedIndex = clampIndex(values.indexOf(selectedValue), values.length);

  // 값 목록이 바뀌거나(경계 연·월) 선택이 바뀌면 그 위치로 스냅.
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
      scrollY.setValue(selectedIndex * ITEM_HEIGHT);
    }, 0);
    return () => clearTimeout(timer);
  }, [scrollY, selectedIndex, values.length]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(
      Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT),
      values.length,
    );
    const value = values[index];
    if (typeof value === 'number' && value !== selectedValue) {
      onChange(value);
    }
  }, [onChange, selectedValue, values]);

  return (
    <View style={styles.wheelColumn}>
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.wheelContent}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
      >
        {values.map((value, index) => {
          const inputRange = [
            (index - 2) * ITEM_HEIGHT,
            (index - 1) * ITEM_HEIGHT,
            index * ITEM_HEIGHT,
            (index + 1) * ITEM_HEIGHT,
            (index + 2) * ITEM_HEIGHT,
          ];
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.22, 0.48, 1, 0.48, 0.22],
            extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.92, 0.96, 1.06, 0.96, 0.92],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View key={value} style={[styles.optionRow, { opacity, transform: [{ scale }] }]}>
              <Text style={[styles.optionText, value === selectedValue ? styles.optionTextSelected : null]}>
                {value}{suffix}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

function RunmadangDateWheelSheetImpl({
  visible,
  title,
  minKey,
  maxKey,
  selectedKey,
  onSelect,
  onClose,
}: RunmadangDateWheelSheetProps) {
  const initialKey = clampDateKeyToRange(selectedKey ?? minKey, minKey, maxKey);
  const [year, setYear] = useState(() => getDateKeyParts(initialKey).year);
  const [month, setMonth] = useState(() => getDateKeyParts(initialKey).month);
  const [day, setDay] = useState(() => getDateKeyParts(initialKey).day);

  // 열릴 때마다 현재 선택값(또는 최소값)으로 초기화.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const parts = getDateKeyParts(clampDateKeyToRange(selectedKey ?? minKey, minKey, maxKey));
    setYear(parts.year);
    setMonth(parts.month);
    setDay(parts.day);
  }, [maxKey, minKey, selectedKey, visible]);

  const { years, months, days } = buildDateWheelRanges(minKey, maxKey, year, month);

  // 경계 이동으로 현재 월/일이 범위를 벗어나면 가장 가까운 값으로 끌어온다.
  const effectiveMonth = months.includes(month)
    ? month
    : (month < months[0] ? months[0] : months[months.length - 1]) ?? month;
  const effectiveDay = days.includes(day)
    ? day
    : (day < days[0] ? days[0] : days[days.length - 1]) ?? day;

  const handleConfirm = useCallback(() => {
    const key = clampDateKeyToRange(buildDateKey(year, effectiveMonth, effectiveDay), minKey, maxKey);
    onSelect(key);
  }, [effectiveDay, effectiveMonth, maxKey, minKey, onSelect, year]);

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="날짜 선택 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.wheelsRow}>
            <View pointerEvents="none" style={styles.selectionBand} />
            <Wheel values={years} selectedValue={year} suffix="년" onChange={setYear} />
            <Wheel values={months} selectedValue={effectiveMonth} suffix="월" onChange={setMonth} />
            <Wheel values={days} selectedValue={effectiveDay} suffix="일" onChange={setDay} />
          </View>
          <Pressable accessibilityRole="button" onPress={handleConfirm} style={styles.confirmButton}>
            <Text style={styles.confirmText}>선택</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const RunmadangDateWheelSheet = memo(RunmadangDateWheelSheetImpl);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 18, 32, 0.48)',
  },
  sheet: {
    // 모달 시트도 네이티브 합성 대상 — 반투명 유리 대신 불투명 크롬.
    backgroundColor: colors.surfaceChrome,
    borderTopLeftRadius: radii.cardLarge,
    borderTopRightRadius: radii.cardLarge,
    gap: spacing.s16,
    padding: spacing.s20,
    paddingBottom: spacing.s24,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    height: 4,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  wheelsRow: {
    flexDirection: 'row',
    height: ITEM_HEIGHT * VISIBLE_ITEM_COUNT,
    overflow: 'hidden',
  },
  wheelColumn: {
    flex: 1,
  },
  wheelContent: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  selectionBand: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brandSoftBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: ITEM_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: WHEEL_VERTICAL_PADDING,
  },
  optionRow: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  optionTextSelected: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.inkPill,
    borderRadius: radii.pill,
    paddingVertical: spacing.s14,
  },
  confirmText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
