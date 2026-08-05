import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { registerTourTarget } from '@/features/tour/tourTargetRegistry';

// 설명 투어가 짚을 수 있는 UI 래퍼. collapsable={false} 로 네이티브 뷰를 보존해야
// measureInWindow 가 실좌표를 돌려준다. 감싼다고 레이아웃이 변하지 않도록 스타일은
// 호출부가 필요할 때만 넘긴다.

export function TourTarget({
  id,
  children,
  style,
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);

  useEffect(() => registerTourTarget(id, () => new Promise((resolve) => {
    const node = ref.current;
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      resolve(
        Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0
          ? { x, y, width, height }
          : null,
      );
    });
  })), [id]);

  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
