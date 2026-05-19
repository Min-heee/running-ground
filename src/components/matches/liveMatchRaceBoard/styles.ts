import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const liveMatchRaceBoardStyles = StyleSheet.create({
  card: {
    gap: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.navyBorder,
    backgroundColor: colors.slateDark,
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: colors.white,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.borderMuted,
    fontSize: 17,
    lineHeight: 27,
  },
  rows: {
    gap: 14,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 104,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 18,
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
    gap: 4,
  },
  rankText: {
    color: colors.brandTint,
    fontSize: 16,
    fontWeight: '800',
  },
  rankTextForfeited: {
    color: colors.dangerLight,
  },
  nameText: {
    color: colors.white,
    fontSize: 19,
    fontWeight: '800',
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
    paddingTop: 10,
  },
  trackLine: {
    position: 'relative',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
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
    borderRadius: 999,
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
    fontSize: 10,
    fontWeight: '900',
  },
  distanceText: {
    position: 'absolute',
    top: 28,
    color: colors.brandWashStrong,
    fontSize: 18,
    fontWeight: '800',
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
    fontWeight: '800',
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: colors.dangerLight,
  },
});
