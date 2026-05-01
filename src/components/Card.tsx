import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

export function Card({ children, style, ...rest }: PropsWithChildren<{ style?: StyleProp<ViewStyle> } & ViewProps>) {
  return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
});
