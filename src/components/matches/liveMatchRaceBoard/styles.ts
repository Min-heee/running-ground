import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const liveMatchRaceBoardStyles = StyleSheet.create({
  card: {
    gap: spacing.s18,
    borderRadius: 30,
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
    fontSize: 29,
    fontWeight: fontWeights.extraBold,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.borderMuted,
    fontSize: 17,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s18,
  },
  rowCurrent: {
    borderColor: 'rgba(129,140,248,0.82)',
    backgroundColor: 'rgba(79,70,229,0.22)',
  },
  rowForfeited: {
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(127,29,29,0.22)',
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
  nameText: {
    color: colors.white,
    fontSize: 19,
    fontWeight: fontWeights.extraBold,
    lineHeight: 23,
  },
  nameTextCurrent: {
    color: colors.brandWashStrong,
  },
  nameTextForfeited: {
    color: colors.dangerBorder,
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
    backgroundColor: 'rgba(148,163,184,0.28)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(109,94,247,0.46)',
  },
  trackProgressCurrent: {
    backgroundColor: 'rgba(129,140,248,0.58)',
  },
  trackProgressForfeited: {
    backgroundColor: 'rgba(248,113,113,0.42)',
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
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
    fontSize: 17,
    fontWeight: fontWeights.extraBold,
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: colors.dangerLight,
  },
});
