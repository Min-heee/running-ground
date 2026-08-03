// Android용 — Google Maps 키가 박힌 바이너리(versionCode 41+)에서는 iOS와 같은 실제
// 지도를 그리고, 키 없는 옛 빌드(38~40)에서는 위치 라벨 카드로 폴백한다.

import { StyleSheet, Text, View } from 'react-native';
import { isAndroidMapsReady } from '@/integrations/androidMapsAvailability';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import { FriendLiveMapView as NativeFriendLiveMapView } from './FriendLiveMapView.native';

type FriendLiveMapViewProps = {
  latitude: number;
  longitude: number;
  friendName: string;
  ageSeconds: number;
};

export function FriendLiveMapView(props: FriendLiveMapViewProps) {
  if (isAndroidMapsReady()) {
    return <NativeFriendLiveMapView {...props} />;
  }

  return (
    <View style={styles.placeholder}>
      <View style={[styles.dot, props.ageSeconds > 60 ? styles.dotStale : undefined]} />
      <Text style={styles.title}>{props.friendName}님이 달리는 중</Text>
      <Text style={styles.caption}>지도는 앱 업데이트 후 볼 수 있어요. 아래 현황으로 응원해주세요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s10,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.successStrong,
  },
  dotStale: {
    opacity: 0.5,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  caption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
