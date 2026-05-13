import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const ITEM_HEIGHT = 48;
const VISIBLE_WHEEL_ROWS = 5;
const WHEEL_PADDING = ITEM_HEIGHT * 2;

type MatchRoomWheelColumnProps = {
  options: (string | number)[];
  selectedIndex: number;
  onChange: (index: number) => void;
  formatLabel?: (value: string | number) => string;
  width: number;
};

export function MatchRoomWheelColumn({
  options,
  selectedIndex,
  onChange,
  formatLabel = (value) => String(value),
  width,
}: MatchRoomWheelColumnProps) {
  const scrollRef = useRef<ScrollView | null>(null);

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
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
          onChange(Math.max(0, Math.min(options.length - 1, nextIndex)));
        }}
      >
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Pressable
              key={`${option}-${index}`}
              style={styles.wheelItem}
              onPress={() => onChange(index)}
            >
              <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : undefined]}>
                {formatLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelColumnWrap: {
    height: ITEM_HEIGHT * VISIBLE_WHEEL_ROWS,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#0F172A',
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
    color: '#98A2B3',
    fontSize: 18,
    fontWeight: '700',
  },
  wheelItemTextSelected: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
});
