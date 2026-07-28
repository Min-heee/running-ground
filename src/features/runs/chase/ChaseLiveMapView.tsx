// 기본(웹/기타) 폴백 — 지도 모듈이 없는 환경에선 간단 안내만. 실제 구현은
// .native.tsx(iOS 애플 지도)와 .android.tsx(레이더)가 플랫폼 해석으로 대체한다.

import { StyleSheet, Text, View } from 'react-native';
import type { ChaseLiveParticipant } from '@/lib/api/types';
import { colors, fontWeights, spacing } from '@/theme/tokens';

type ChaseLiveMapViewProps = {
  latitude: number;
  longitude: number;
  radiusM: number;
  polygon?: { latitude: number; longitude: number }[];
  participants: ChaseLiveParticipant[];
};

export function ChaseLiveMapView({ participants }: ChaseLiveMapViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>라이브 지도는 iPhone/Android 앱에서 볼 수 있어요.</Text>
      <Text style={styles.subText}>현재 경기장 러너 {participants.length}명</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.borderMuted,
  },
  text: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  subText: {
    color: colors.textSecondary,
  },
});
