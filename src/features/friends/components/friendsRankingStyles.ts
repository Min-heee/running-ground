// 친구 순위표 (오너 2026-08-03: 토스 뉴트럴 전환에 맞춰 다크 카드 폐기).
// 흰 카드 + 회색 필 내부 요소 + 보라 포인트(순위 배지·활성 탭 글씨) — 앱 공통 결.

import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const friendsRankingStyles = StyleSheet.create({
  card: {
    padding: spacing.s18,
    gap: spacing.s14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  // 토스식 세그먼트: 회색 트랙 + 활성은 흰 필 + 보라 글씨.
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.lg,
  },
  modeButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
  },
  modeButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  modeButtonTextActive: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  countBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  countBadgeText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s14,
  },
  summaryItem: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.borderMuted,
    marginHorizontal: spacing.s12,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  rankList: {
    gap: spacing.s10,
  },
  rankCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.s16,
    paddingVertical: 15,
  },
  // 내 줄: 흰 카드 + 브랜드 보더 (선택 카드와 같은 신호 언어).
  myCard: {
    borderColor: fixedColors.brand,
    backgroundColor: colors.surface,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  rankBadge: {
    minWidth: 52,
    borderRadius: radii.pill,
    backgroundColor: fixedColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  rankBadgeText: {
    color: fixedColors.white,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  runnerMeta: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minWidth: 0,
  },
  runnerName: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  selfBadge: {
    backgroundColor: fixedColors.brandWashStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  selfBadgeText: {
    color: fixedColors.brandDeep,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  // 라이브 필: 고정 연녹 짝 — 양 모드에서 동일하게 성립.
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: fixedColors.successCard,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  livePillDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: fixedColors.success,
  },
  livePillText: {
    color: fixedColors.successText,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  metricInline: {
    width: 72,
    alignItems: 'flex-end',
  },
  metricInlineValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
});
