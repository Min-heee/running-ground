import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { tourCardStyles } from './tourCardStyles';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const appIcon = require('../../../../../assets/branding/icon.png');

// 첫인상은 미니멀로: 브랜드 아이콘 + WELCOME TO RUNNINGGROUND 한 줄, 중앙 정렬이 전부다.
export const WelcomeStepCard = memo(function WelcomeStepCard() {
  return (
    <View style={[tourCardStyles.heroCard, styles.centered]}>
      <Image source={appIcon} style={styles.brandIcon} />
      <Text style={styles.welcomeText}>WELCOME TO{'\n'}RUNNINGGROUND</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.s24,
  },
  brandIcon: {
    borderRadius: radii.heroLg,
    height: 108,
    marginBottom: spacing.s20,
    width: 108,
  },
  welcomeText: {
    color: colors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
    letterSpacing: 3,
    lineHeight: 36,
    textAlign: 'center',
  },
});
