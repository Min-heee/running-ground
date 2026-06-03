import type { ImageSourcePropType } from 'react-native';

export const RANK_TIER_SYMBOL: Record<string, ImageSourcePropType> = {
  입문: require('./symbols/intro.png'),
  러너: require('./symbols/runner.png'),
  페이서: require('./symbols/pacer.png'),
  레이서: require('./symbols/racer.png'),
  엘리트: require('./symbols/elite.png'),
};
