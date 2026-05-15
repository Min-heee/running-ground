import type { ReactNode } from 'react';
import { View } from 'react-native';
import { nrcBridgeGuideDetailStyles as styles } from './NrcBridgeGuideSection.styles';

type NrcBridgeGuideActionBlockProps = {
  children: ReactNode;
};

export function NrcBridgeGuideActionBlock({ children }: NrcBridgeGuideActionBlockProps) {
  return <View style={styles.actions}>{children}</View>;
}
