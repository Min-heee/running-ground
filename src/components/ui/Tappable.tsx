import { forwardRef } from 'react';
import { Pressable, PressableProps, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

const DEFAULT_RIPPLE = { color: colors.brandPrimaryRipple, borderless: false } as const;

export const Tappable = forwardRef<View, PressableProps>(function Tappable(
  { children, style, hitSlop = 8, android_ripple, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      hitSlop={hitSlop}
      android_ripple={android_ripple ?? DEFAULT_RIPPLE}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
});
