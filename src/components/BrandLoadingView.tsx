import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { colors, radii } from '@/theme/tokens';

const appIcon = require('../../assets/branding/icon.png');

const PULSE_DURATION_MS = 900;

export function BrandLoadingView({ style }: { style?: StyleProp<ViewStyle> }) {
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
    <View style={[styles.container, style]}>
      <Animated.Image
        source={appIcon}
        style={[styles.icon, { opacity, transform: [{ scale }] }]}
        resizeMode="cover"
      />
    </View>
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
