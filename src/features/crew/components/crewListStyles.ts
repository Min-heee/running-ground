// 크루대전 화면 공통 결 (오너 2026-09-18: "지금 앱 언어 그대로"). 새 문법을 만들지 않고
// 기록 탭(달 머리글 + 흰 블록 한 겹의 헤어라인 행)과 마이 탭 계정 카드(행 문법)를 그대로 옮겼다.
// - 섹션 머리글은 맨바닥 한 줄(ActivityMonthSection.header와 같은 값).
// - 행 블록 카드는 padding 0 — 구분선·내 크루 바탕이 카드 폭 끝에서 끝까지 이어진다.
// - 카드 안에 채운 상자를 또 넣지 않는다. 위계는 크기·굵기로만. 그림자 없음(Card가 이미 납작).

import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const crewListStyles = StyleSheet.create({
  section: {
    gap: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  sectionMeta: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    textAlign: 'right',
  },
  // 행 눌림 배경·내 크루 바탕이 카드 라운드를 넘어 각지게 삐져나오지 않도록 잘라낸다.
  rowsCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingVertical: spacing.s14,
    paddingHorizontal: spacing.s16,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  // 내 크루 행: 연보라 바탕 + 오른쪽 값만 보라 (FriendRankRow '내 줄'의 브랜드 신호와 같은 뜻).
  rowMine: {
    backgroundColor: colors.brandSoft,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  nameLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.lg,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  // 빈 등수 줄의 이름 자리 '—'.
  nameEmpty: {
    color: colors.textTertiary,
  },
  // 이름 옆 회색 꼬리표('캡틴', '나', '10/9 합류') — 알약·채움 없이 글자만.
  nameTag: {
    flexShrink: 0,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  rankNumber: {
    width: 24,
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
    textAlign: 'center',
  },
  // 1~3위는 금색 글자 — 왕관 배지 없이 숫자 색만 (무장식). 칩용 podiumGoldText가 아니라 표면용
  // 테마 토큰 — 다크 유리 위에서도 4위 이하 숫자보다 흐려지지 않게 (2026-09-18).
  rankNumberPodium: {
    color: colors.podiumGoldOnSurface,
  },
  // 등수 칸 — 1~3위 왕관 메달(RankMarker, 최소 폭 42)과 숫자가 같은 폭을 쓴다.
  rankCell: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 내 크루 화면 멤버 줄: 이름 아래 기여 막대.
  memberMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  memberBarTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  memberBarFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.textTertiary,
  },
  memberBarFillMine: {
    backgroundColor: fixedColors.brand,
  },
  // '어제보다 ▲▼' 칸 (오너 2026-09-19): 순위 숫자 바로 옆 좁은 칸. 오르면 보라, 내리면 회색.
  rankChange: {
    width: 26,
    marginLeft: -spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  rankChangeUp: {
    color: colors.brandStrong,
  },
  value: {
    flexShrink: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  // brand(#6D5EF7)는 다크 유리 위에서 대비가 모자라 brandStrong을 쓴다 (기록 행과 같은 판단).
  valueMine: {
    color: colors.brandStrong,
  },
  valueMuted: {
    color: colors.textSecondary,
  },
  // 행 안의 글자 액션('승인', '거절', '내보내기', '취소') — 버튼 없이 글자만, 누르는 영역은 hitSlop으로.
  textAction: {
    flexShrink: 0,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  textActionBrand: {
    color: colors.brandStrong,
  },
  textActionDanger: {
    color: colors.danger,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  emptyBlock: {
    gap: spacing.sm,
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s16,
  },
  // '전체 순위 ›' 꼬리 행 — 친구 순위표 '더보기'와 같은 문법(헤어라인 위 한 줄, 글자 + 꺾쇠).
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  footerText: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  footerChevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  // 마이 탭 계정 카드와 같은 행 문법(gap 0, 행 위 헤어라인, bold 라벨, 세로 12). 머리 제목이 없어
  // 첫 행은 구분선 없이 카드 위 여백에 바로 앉는다.
  actionsCard: {
    gap: 0,
    paddingVertical: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
    paddingVertical: spacing.s12,
  },
  actionRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  actionRowDisabled: {
    opacity: 0.6,
  },
  actionLabel: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  actionValue: {
    flexShrink: 0,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  actionValueBrand: {
    color: colors.brandStrong,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 18,
  },
  // 맨바닥 위 흰 입력칸 — 카드 안 회색 입력칸(채운 상자 속 채운 상자)을 피해 필드에 바로 둔다.
  // 흰 박스 + 은은한 테두리는 공용 세그먼트('field' 결)와 같은 값.
  fieldInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  fieldBlock: {
    gap: spacing.xxl,
  },
});
