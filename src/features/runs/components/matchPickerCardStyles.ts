// 러닝 탭 '고르는 카드'의 단 하나뿐인 치수·색 정의.
//
// 매칭 탭의 모드 카드(1대1 매치 / 그룹 대결)와 파티런 탭의 방 종류 칩(1대1 대결 / 그룹 대결)은
// 화면상 같은 자리에 오는 같은 층이다. 각자 스타일을 들고 있었더니 한쪽 값만 바뀌면서 탭을
// 옮길 때 카드가 커졌다 작아졌다 했다 — 그래서 두 컴포넌트가 이 파일 하나를 같이 쓴다.
// 치수를 고칠 일이 있으면 여기만 고치면 양쪽이 함께 움직인다.

import { StyleSheet } from 'react-native';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

export const matchPickerCardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  card: {
    width: '48%',
    gap: spacing.xxs,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    minHeight: 68,
    justifyContent: 'center',
  },
  cardIdle: {
    borderColor: colors.cardEdge,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  cardSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  cardSummarySelected: {
    color: colors.brand,
    fontSize: fontSizes.sm,
  },
});
