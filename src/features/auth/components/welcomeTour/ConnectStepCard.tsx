import { memo } from 'react';
import { Text, View } from 'react-native';
import { tourCardStyles as styles } from './tourCardStyles';

export const ConnectStepCard = memo(function ConnectStepCard() {
  return (
    <View style={styles.heroCard}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>🔗</Text>
      </View>
      <Text style={styles.kicker}>STEP 2 · 선택</Text>
      <Text style={styles.title}>기록 연동</Text>
      <Text style={styles.description}>
        NRC·Strava·애플워치·갤럭시워치 기록을 가져와 한 곳에 모을 수 있어요. 나중에 설정에서도 할 수 있어요.
      </Text>
    </View>
  );
});
