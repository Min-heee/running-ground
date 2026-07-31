// Android용 — Google Maps API 키가 아직 없어(백로그) 지도 대신 위치 라벨 카드로 대체한다.
// 키가 생기면 .native.tsx를 공용으로 승격하고 이 파일을 지운다.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type FriendLiveMapViewProps = {
  latitude: number;
  longitude: number;
  friendName: string;
  ageSeconds: number;
};

export function FriendLiveMapView({ friendName, ageSeconds }: FriendLiveMapViewProps) {
  return (
    <View style={styles.placeholder}>
      <View style={[styles.dot, ageSeconds > 60 ? styles.dotStale : undefined]} />
      <Text style={styles.title}>{friendName}님이 달리는 중</Text>
      <Text style={styles.caption}>안드로이드 지도는 준비 중이에요. 아래 현황으로 응원해주세요.</Text>
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
