import { memo } from 'react';
import { Platform, Text, View } from 'react-native';
import { tourCardStyles as styles } from './tourCardStyles';

// Platform-appropriate copy: iOS has no auto-import health integration in this
// version (Apple-Health import removed per App Store 2.5.1, re-add deferred
// post-launch), so iOS copy must not promise 애플 건강.
const CONNECT_STEP_DESCRIPTION = Platform.OS === 'ios'
  ? '러닝 기록은 앱에서 직접 측정하거나 수동으로 추가해 한 곳에 모을 수 있어요. 기록 관리는 나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.'
  : '헬스 커넥트의 러닝 기록을 가져와 한 곳에 모을 수 있어요. 선택 사항이고, 나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.';

export const ConnectStepCard = memo(function ConnectStepCard() {
  return (
    <View style={styles.heroCard}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>🔗</Text>
      </View>
      <Text style={styles.kicker}>STEP 2 · 선택</Text>
      <Text style={styles.title}>기록 연동</Text>
      <Text style={styles.description}>{CONNECT_STEP_DESCRIPTION}</Text>
    </View>
  );
});
