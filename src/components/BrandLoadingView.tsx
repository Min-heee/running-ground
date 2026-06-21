import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, radii } from '@/theme/tokens';

const appIcon = require('../../assets/branding/icon.png');

const PULSE_DURATION_MS = 900;

// `edges` defaults to ['top'] for full-screen use (avoid the status bar). Pass
// [] when embedding inside a card (e.g. the arena road shell) so the safe-area
// inset doesn't push the logo off-center within that smaller container.
export function BrandLoadingView({
  style,
  edges = ['top'],
}: {
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <SafeAreaView style={[styles.container, style]} edges={edges}>
      <Animated.Image
        source={appIcon}
        style={[styles.icon, { opacity, transform: [{ scale }] }]}
        resizeMode="cover"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceApp,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
  },
});
