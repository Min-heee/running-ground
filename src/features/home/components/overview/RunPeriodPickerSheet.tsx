import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import type { RunPeriodOption } from '@/features/home/utils/runPeriodSummary';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type RunPeriodPickerSheetProps = {
  visible: boolean;
  options: RunPeriodOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
};

const ITEM_HEIGHT = 48;
const VISIBLE_ITEM_COUNT = 5;
const WHEEL_VERTICAL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEM_COUNT / 2);

function clampIndex(index: number, optionsLength: number) {
  if (optionsLength <= 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), optionsLength - 1);
}

function resolveIndexFromOffset(offsetY: number, optionsLength: number) {
  return clampIndex(Math.round(offsetY / ITEM_HEIGHT), optionsLength);
}

function RunPeriodPickerSheetImpl({
  visible,
  options,
  selectedKey,
  onSelect,
  onClose,
}: RunPeriodPickerSheetProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.key === selectedKey));
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    setCurrentIndex(selectedIndex);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
      scrollY.setValue(selectedIndex * ITEM_HEIGHT);
    }, 0);

    return () => clearTimeout(timer);
  }, [scrollY, selectedIndex, visible]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrentIndex(resolveIndexFromOffset(event.nativeEvent.contentOffset.y, options.length));
  }, [options.length]);

  const handleConfirm = useCallback(() => {
    const selectedOption = options[clampIndex(currentIndex, options.length)];

    if (selectedOption) {
      onSelect(selectedOption.key);
    }
  }, [currentIndex, onSelect, options]);

  const optionItems = useMemo(() => options.map((option, index) => {
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
      <Animated.View
        key={option.key}
        style={[
          styles.optionRow,
          { opacity, transform: [{ scale }] },
        ]}
      >
        <Text style={[
          styles.optionText,
          index === currentIndex ? styles.optionTextSelected : null,
        ]}
        >
          {option.label}
        </Text>
      </Animated.View>
    );
  }), [currentIndex, options, scrollY]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="기간 선택 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>기간 선택</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.wheel}>
            <View pointerEvents="none" style={styles.selectionBand} />
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
              {optionItems}
            </Animated.ScrollView>
          </View>
          <Pressable accessibilityRole="button" onPress={handleConfirm} style={styles.confirmButton}>
            <Text style={styles.confirmText}>선택</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const RunPeriodPickerSheet = memo(RunPeriodPickerSheetImpl);

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
    backgroundColor: colors.surface,
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
  wheel: {
    height: ITEM_HEIGHT * VISIBLE_ITEM_COUNT,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wheelContent: {
    paddingVertical: WHEEL_VERTICAL_PADDING,
  },
  selectionBand: {
    alignSelf: 'stretch',
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
    backgroundColor: colors.textPrimary,
    borderRadius: radii.pill,
    paddingVertical: spacing.s14,
  },
  confirmText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
