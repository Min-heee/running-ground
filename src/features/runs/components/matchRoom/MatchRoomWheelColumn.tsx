import { memo, type ElementRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { colors } from '@/theme/tokens';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const ITEM_HEIGHT = 48;
const VISIBLE_WHEEL_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * 2;
const defaultFormatLabel = (value: string | number) => String(value);

type WheelOption = string | number;

type MatchRoomWheelColumnProps = {
  options: WheelOption[];
  selectedIndex: number;
  onChange: (index: number) => void;
  formatLabel?: (value: WheelOption) => string;
  width: number;
};

const MatchRoomWheelItem = memo(function MatchRoomWheelItem({
  option,
  index,
  isSelected,
  onChange,
  formatLabel,
}: {
  option: WheelOption;
  index: number;
  isSelected: boolean;
  onChange: (index: number) => void;
  formatLabel: (value: WheelOption) => string;
}) {
  const handlePress = useCallback(() => {
    onChange(index);
  }, [index, onChange]);

  return (
    <Pressable
      style={styles.wheelItem}
      onPress={handlePress}
    >
      <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : undefined]}>
        {formatLabel(option)}
      </Text>
    </Pressable>
  );
});

export function MatchRoomWheelColumn({
  options,
  selectedIndex,
  onChange,
  formatLabel = defaultFormatLabel,
  width,
}: MatchRoomWheelColumnProps) {
  const scrollRef = useRef<ElementRef<typeof ScrollView> | null>(null);

  const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    onChange(Math.max(0, Math.min(options.length - 1, nextIndex)));
  }, [onChange, options.length]);

  const wheelItems = useMemo(() => (
    options.map((option, index) => (
      <MatchRoomWheelItem
        key={`${option}-${index}`}
        option={option}
        index={index}
        isSelected={index === selectedIndex}
        onChange={onChange}
        formatLabel={formatLabel}
      />
    ))
  ), [formatLabel, onChange, options, selectedIndex]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    });

    return () => cancelAnimationFrame(frameId);
  }, [selectedIndex]);

  return (
    <View style={[styles.wheelColumnWrap, { width }]}>
      <View style={styles.wheelHighlight} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {wheelItems}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelColumnWrap: {
    height: ITEM_HEIGHT * VISIBLE_WHEEL_ROWS,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: colors.slateDark,
    position: 'relative',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'rgba(109, 94, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    zIndex: 1,
  },
  wheelContent: {
    paddingVertical: WHEEL_PADDING,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    color: colors.textTertiary,
    fontSize: 18,
    fontWeight: '700',
  },
  wheelItemTextSelected: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
});
