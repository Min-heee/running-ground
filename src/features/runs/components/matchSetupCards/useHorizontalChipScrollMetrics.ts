import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent } from 'react-native';

export function useHorizontalChipScrollMetrics() {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setVisibleWidth(event.nativeEvent.layout.width);
  }, []);
  const handleContentSizeChange = useCallback((width: number) => {
    setContentWidth(width);
  }, []);
  const handleScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

  return {
    contentWidth,
    handleContentSizeChange,
    handleLayout,
    handleScroll,
    scrollX,
    visibleWidth,
  };
}
