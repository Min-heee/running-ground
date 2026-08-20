import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

// 별이 태어나는 순간 (오너 2026-08-16: "기록연동 딱 하면 별 생성중 뜨면서 딱 자기 별이
// 만들어지고"). 우주 탭을 처음 여는 한 번만.
//
// 애니메이션은 전부 Animated + useNativeDriver다 — 이 화면은 그 뒤에서 3D 우주가 돌고
// 있어서, JS 스레드로 도는 연출을 얹으면 축하하는 동안 우주가 버벅인다.

const GATHERING_MS = 1500;
const BORN_MS = 1100;

export function StarBirthOverlay({ onDone }: { onDone: () => void }) {
  const [born, setBorn] = useState(false);
  const core = useRef(new Animated.Value(0)).current;
  const veil = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    // 점 하나가 부풀며 밝아진다 — 기록이 뭉쳐 별이 되는 그림.
    const grow = Animated.timing(core, {
      toValue: 1,
      duration: GATHERING_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    grow.start(({ finished }) => {
      if (!finished) {
        return;
      }

      setBorn(true);

      Animated.timing(veil, {
        toValue: 0,
        duration: BORN_MS,
        delay: 420,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished: faded }) => {
        if (faded) {
          doneRef.current();
        }
      });
    });

    return () => {
      grow.stop();
    };
  }, [core, veil]);

  return (
    <Animated.View style={[styles.overlay, { opacity: veil }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: core.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.9] }),
            transform: [{ scale: core.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.core,
          {
            opacity: core.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ scale: core.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }],
          },
        ]}
      />
      <Text style={styles.title}>{born ? '당신의 별이 태어났어요' : '별을 만드는 중'}</Text>
      <Text style={styles.caption}>
        {born ? '달린 거리가 별의 크기가 됩니다' : '기록을 별로 옮기고 있어요'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 6, 15, 0.92)',
    gap: 10,
  },
  halo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 190, 90, 0.16)',
  },
  core: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 214, 130, 0.96)',
    marginBottom: 18,
  },
  title: {
    color: 'rgba(244, 248, 255, 0.98)',
    fontSize: 17,
    fontWeight: '700',
  },
  caption: {
    color: 'rgba(176, 196, 232, 0.86)',
    fontSize: 12,
  },
});
