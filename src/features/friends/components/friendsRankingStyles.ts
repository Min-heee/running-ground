// 친구 순위표 (오너 2026-08-03: 토스 뉴트럴 전환에 맞춰 다크 카드 폐기).
// 흰 카드 + 회색 필 내부 요소 + 보라 포인트(순위 배지·활성 탭 글씨) — 앱 공통 결.
// 세로 다이어트 (오너 2026-09-18 "너무 위아래로 뚱뚱해"): 구조는 그대로 두고 카드 패딩 18→16,
// 요소 간격 14→12, 요약바·행 세로 패딩 14/15→10, 행 간격 10→8, 제목은 옆 '친구' 카드와 같은
// 18pt로 — 5명 카드 기준 약 90pt 낮아진다.

import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const friendsRankingStyles = StyleSheet.create({
  card: {
    padding: spacing.s16,
    gap: spacing.s12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
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
    paddingVertical: spacing.s10,
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
    gap: spacing.xxl,
  },
  // '더보기' 푸터 — 홈 랭크 카드의 '전적 ›' 푸터와 같은 문법(헤어라인 위 한 줄, 글자 + 꺾쇠).
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing.s10,
  },
  moreButtonText: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  moreButtonHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    includeFontPadding: false,
  },
  moreButtonChevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  rankCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s10,
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
  // 순위 칸 — 1~3위 왕관 배지와 4위+ 맨 텍스트가 같은 폭에 앉아 이름 줄이 정렬된다.
  rankSlot: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPlain: {
    color: colors.textSecondary,
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
