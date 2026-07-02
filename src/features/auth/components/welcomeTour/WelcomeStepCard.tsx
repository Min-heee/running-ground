import { memo } from 'react';
import { Text, View } from 'react-native';
import { tourCardStyles as styles } from './tourCardStyles';

export const WelcomeStepCard = memo(function WelcomeStepCard() {
  return (
    <View style={styles.heroCard}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>🏁</Text>
      </View>
      <Text style={styles.kicker}>WELCOME</Text>
      <Text style={styles.title}>달리기, 이제 진짜 승부</Text>
      <Text style={styles.description}>
        매칭으로 만난 러너와 실시간 대결. 거리와 페이스로 승부를 가리고 랭크를 올려요.
      </Text>
    </View>
  );
});
