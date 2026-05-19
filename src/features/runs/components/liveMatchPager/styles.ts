import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const liveMatchPagerStyles = StyleSheet.create({
  shell: {
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  tabSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  tabTextSelected: {
    color: colors.brandStrong,
  },
  page: {
    gap: 14,
    paddingRight: 0,
  },
  androidPage: {
    gap: 14,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
});
