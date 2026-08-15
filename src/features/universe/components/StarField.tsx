import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildStarField } from '@/features/universe/utils/universeLayout';

// 배경 별. 시드 고정 좌표라 리렌더가 나도 자리가 흔들리지 않는다.

function StarFieldComponent({
  width,
  height,
  count = 90,
}: {
  width: number;
  height: number;
  count?: number;
}) {
  const dots = useMemo(() => buildStarField(count), [count]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((dot, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: dot.x * width,
            top: dot.y * height,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: `rgba(226, 236, 255, ${dot.opacity.toFixed(2)})`,
          }}
        />
      ))}
    </View>
  );
}

export const StarField = memo(StarFieldComponent);
