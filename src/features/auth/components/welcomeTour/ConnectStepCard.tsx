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
        애플 건강·헬스 커넥트의 러닝 기록을 가져와 한 곳에 모을 수 있어요. 선택 사항이고,
        나중에 마이페이지 › 기록 연동 관리에서 언제든 할 수 있어요.
      </Text>
    </View>
  );
});
