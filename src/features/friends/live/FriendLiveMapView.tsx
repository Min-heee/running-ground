// 웹 스텁 — 네이티브 지도가 없는 플랫폼에서는 자리만 지킨다.

import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/theme/tokens';

type FriendLiveMapViewProps = {
  latitude: number;
  longitude: number;
  friendName: string;
  ageSeconds: number;
};

export function FriendLiveMapView(_props: FriendLiveMapViewProps) {
  return <View style={styles.placeholder} />;
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
  },
});
