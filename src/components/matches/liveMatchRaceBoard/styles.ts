import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const liveMatchRaceBoardStyles = StyleSheet.create({
  card: {
    gap: spacing.s18,
    borderRadius: radii.heroLg,
    borderWidth: 1,
    borderColor: colors.navyBorder,
    backgroundColor: colors.slateDark,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s22,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 3,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.metricLarge,
    fontWeight: fontWeights.extraBold,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: fixedColors.borderMuted,
    fontSize: fontSizes.large,
    lineHeight: 27,
  },
  rows: {
    gap: spacing.s14,
    paddingBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    minHeight: 104,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.raceBoardRowBorder,
    backgroundColor: colors.raceBoardRowBg,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s18,
  },
  rowCurrent: {
    borderColor: colors.raceBoardCurrentBorder,
    backgroundColor: colors.raceBoardCurrentBg,
  },
  rowForfeited: {
    borderColor: colors.raceBoardForfeitedBorder,
    backgroundColor: colors.raceBoardForfeitedBg,
  },
  rowProgressivePlaceholder: {
    borderColor: colors.raceBoardPlaceholderBorder,
    backgroundColor: colors.raceBoardPlaceholderBg,
  },
  nameColumn: {
    width: 64,
    gap: spacing.sm,
  },
  rankText: {
    color: colors.brandTint,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  rankTextForfeited: {
    color: colors.dangerLight,
  },
  rankTextProgressivePlaceholder: {
    color: fixedColors.textTertiary,
  },
  nameText: {
    color: colors.white,
    fontSize: fontSizes.display,
    fontWeight: fontWeights.extraBold,
    lineHeight: 23,
  },
  nameTextCurrent: {
    color: colors.brandWashStrong,
  },
  nameTextForfeited: {
    color: colors.dangerBorder,
  },
  nameTextProgressivePlaceholder: {
    color: fixedColors.borderMuted,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xs,
    backgroundColor: fixedColors.textNeutral,
  },
  resultBadgeWin: {
    backgroundColor: colors.successGoogle,
  },
  resultBadgeLose: {
    backgroundColor: colors.orange,
  },
  resultBadgeDraw: {
    backgroundColor: fixedColors.textNeutral,
  },
  resultBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.black,
  },
  trackColumn: {
    flex: 1,
    minWidth: 106,
  },
  trackStack: {
    position: 'relative',
    height: 48,
    justifyContent: 'flex-start',
    paddingTop: spacing.s10,
  },
  trackLine: {
    position: 'relative',
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.raceBoardTrackLineBg,
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: radii.pill,
    backgroundColor: colors.raceBoardTrackProgressBg,
  },
  trackProgressCurrent: {
    backgroundColor: colors.raceBoardTrackProgressCurrentBg,
  },
  trackProgressForfeited: {
    backgroundColor: colors.raceBoardTrackProgressForfeitedBg,
  },
  trackProgressProgressivePlaceholder: {
    backgroundColor: colors.raceBoardTrackProgressPlaceholderBg,
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: fixedColors.white,
    borderWidth: 6,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDotCurrent: {
    borderColor: colors.brandAccentLight,
  },
  trackDotForfeited: {
    width: 38,
    height: 38,
    marginTop: -19,
    marginLeft: -19,
    backgroundColor: colors.dangerAccent,
    borderWidth: 2,
    borderColor: colors.dangerBorder,
  },
  trackDotProgressivePlaceholder: {
    borderColor: fixedColors.textTertiary,
  },
  trackDotForfeitedText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.black,
  },
  distanceText: {
    position: 'absolute',
    top: 28,
    color: colors.brandWashStrong,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  distanceTextCentered: {
    transform: [{ translateX: -34 }],
  },
  distanceTextNearStart: {
    transform: [{ translateX: -10 }],
  },
  distanceTextNearFinish: {
    transform: [{ translateX: -64 }],
  },
  metaColumn: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaRemaining: {
    color: colors.borderCool,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: colors.dangerLight,
  },
  metaRemainingFinished: {
    color: colors.successBright,
  },
  metaRemainingProgressivePlaceholder: {
    color: fixedColors.textTertiary,
  },
});
