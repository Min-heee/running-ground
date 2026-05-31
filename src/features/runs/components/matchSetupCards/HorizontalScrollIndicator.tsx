import { memo, useMemo, useState } from 'react';
import { Animated, type LayoutChangeEvent, View } from 'react-native';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';
import { resolveScrollIndicatorMetrics } from '@/features/runs/components/matchSetupCards/scrollIndicatorMetrics';

type HorizontalScrollIndicatorProps = {
  contentWidth: number;
  scrollX: Animated.Value;
  visibleWidth: number;
};

export const HorizontalScrollIndicator = memo(function HorizontalScrollIndicator({
  contentWidth,
  scrollX,
  visibleWidth,
}: HorizontalScrollIndicatorProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const metrics = useMemo(() => resolveScrollIndicatorMetrics({
    contentWidth,
    trackWidth,
    visibleWidth,
  }), [contentWidth, trackWidth, visibleWidth]);
  const translateX = useMemo(() => scrollX.interpolate({
    inputRange: [0, Math.max(1, metrics.maxScroll)],
    outputRange: [0, metrics.maxThumbTranslateX],
    extrapolate: 'clamp',
  }), [metrics.maxScroll, metrics.maxThumbTranslateX, scrollX]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  if (trackWidth > 0 && !metrics.visible) {
    return null;
  }

  return (
    <View
      style={[
        styles.scrollIndicatorTrack,
        !metrics.visible ? styles.scrollIndicatorTrackHidden : undefined,
      ]}
      onLayout={handleTrackLayout}
    >
      {metrics.visible ? (
        <Animated.View
          style={[
            styles.scrollIndicatorThumb,
            {
              width: metrics.thumbWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}
    </View>
  );
});
