import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { colors, spacing, radii } from '@/theme/tokens';

export function Card({ children, style, ...rest }: PropsWithChildren<{ style?: StyleProp<ViewStyle> } & ViewProps>) {
  return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    // 글래스 엣지 — 다크에선 네온 바이올렛 테두리, 라이트에선 은은한 잉크 라인.
    // (오너 확정 2026-07-26: 1px + 형광 0.65)
    borderWidth: 1,
    borderColor: colors.cardEdge,
    padding: spacing.s16,
    gap: spacing.xxl,
    // 그림자·elevation 없음 (오너 2026-09-18 '카드 납작하게'): 회색 바탕 위 흰 카드는 색 차이만으로
    // 서고, 그림자는 카드 둘레에 옅은 얼룩을 남겼다. 다크는 cardEdge 유리 테두리가 경계를 맡는다.
  },
});
