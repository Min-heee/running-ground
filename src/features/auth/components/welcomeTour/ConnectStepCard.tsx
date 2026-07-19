import { memo } from 'react';
import { Platform, Text, View } from 'react-native';
import { isAppleHealthModuleAvailable } from '@/integrations/appleHealthAvailability';
import { tourCardStyles as styles } from './tourCardStyles';

// Availability-gated copy: iOS may only promise 애플 건강 when the
// RunnigappAppleHealth native reader actually exists in this binary (build
// 49+). On the HealthKit-free build 48 the same OTA'd JS keeps the
// measure/manual-only wording, so the copy never advertises an integration the
// binary can't deliver.
function getConnectStepDescription(): string {
  if (Platform.OS === 'ios') {
    return isAppleHealthModuleAvailable()
      ? '애플 건강의 러닝 기록을 가져와 한 곳에 모을 수 있어요. 선택 사항이고, 나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.'
      : '러닝 기록은 앱에서 직접 측정하거나 수동으로 추가해 한 곳에 모을 수 있어요. 기록 관리는 나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.';
  }

  return '헬스 커넥트의 러닝 기록을 가져와 한 곳에 모을 수 있어요. 선택 사항이고, 나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.';
}

export const ConnectStepCard = memo(function ConnectStepCard() {
  return (
    <View style={styles.heroCard}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>🔗</Text>
      </View>
      <Text style={styles.kicker}>STEP 2 · 선택</Text>
      <Text style={styles.title}>기록 연동</Text>
      <Text style={styles.description}>{getConnectStepDescription()}</Text>
    </View>
  );
});
