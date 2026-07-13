// THEME SYSTEM (dark/light). Every screen bakes StyleSheets from the mutable `colors`
// object below at module-import time, so the theme is selected by MUTATING `colors`
// in place (applyThemePalette) BEFORE screen modules are imported — the root layout
// applies the stored mode behind its boot gate, and expo-router loads route modules
// lazily after that gate. Switching themes at runtime therefore requires a full JS
// reload (see src/theme/themeMode.ts).
//
// Token groups:
//  - THEMED tokens differ between LIGHT_COLORS and DARK_OVERRIDES (surfaces, the
//    text/gray ladder, borders, wash chips and their deep-accent text partners).
//  - CONSTANT tokens are identical in both modes: brand hues, tier/podium colors,
//    the deliberately-dark chrome (night/midnight/dark*/slate*/navy*/indigo inks,
//    the match arena/race board translucents) and pure fills like `white`.
//  - `fixedColors` is a frozen copy of the LIGHT palette. Components that must NOT
//    follow the theme (dark hero cards, live-match chrome, tier-pastel cards) point
//    at fixedColors.X so they render identically in both modes.

const LIGHT_COLORS = {
  black: '#000000',
  white: '#FFFFFF',
  brand: '#6D5EF7',
  brandAccent: '#8E7BFF',
  brandAccentLight: '#7C6DFF',
  brandDeep: '#4338CA',
  brandLavender: '#8D84FF',
  brandLight: '#818CF8',
  brandLighter: '#C7D2FE',
  brandMuted: '#5B4FCF',
  brandStrong: '#4F46E5',
  brandSoft: '#F8F7FF',
  brandSoftBorder: '#E9E7FF',
  brandTint: '#A5B4FC',
  brandWash: '#EEF2FF',
  brandWashStrong: '#E0E7FF',
  dark: '#111827',
  darkInk: '#0B1220',
  darkMuted: '#1F2937',
  darkSoft: '#374151',
  nearBlack: '#11161B',
  night: '#0B1020',
  midnight: '#0C1324',
  textPrimary: '#111827',
  textHeading: '#101828',
  textSecondary: '#667085',
  textTertiary: '#98A2B3',
  textMuted: '#475467',
  textNeutral: '#6B7280',
  textPlaceholder: '#9CA3AF',
  textStrongMuted: '#344054',
  border: '#D0D5DD',
  borderCool: '#CBD5E1',
  borderMuted: '#E5E7EB',
  borderNeutral: '#D1D5DB',
  borderSoft: '#EAECF0',
  surface: '#FFFFFF',
  surfaceApp: '#F5F7FB',
  surfaceMuted: '#F2F4F7',
  surfaceSoft: '#F8FAFC',
  surfaceSubtle: '#F3F4F6',
  surfaceSubtleAlt: '#F9FAFB',
  // Dark chip/button fill that must stay legible with white text in BOTH modes.
  // Light: near-black (the classic dark CTA); dark: an elevated indigo-slate so the
  // active pill still reads as raised on navy cards instead of vanishing.
  inkPill: '#111827',
  success: '#12B76A',
  successBright: '#32D583',
  successGoogle: '#0F9D58',
  successInk: '#123524',
  successStrong: '#027A48',
  successText: '#067647',
  successSoft: '#D1FADF',
  successWash: '#BBF7D0',
  successCard: '#ECFDF3',
  successCardSoft: '#EEFDF3',
  successCardBorder: '#ABEFC6',
  danger: '#B42318',
  dangerAccent: '#EF4444',
  dangerBright: '#D92D20',
  dangerDeep: '#7F1D1D',
  dangerBorder: '#FECACA',
  dangerLight: '#FCA5A5',
  dangerSalmon: '#FDA29B',
  dangerSurface: '#FEF2F2',
  dangerVivid: '#DC2626',
  dangerWash: '#FEE2E2',
  blueAccent: '#1570EF',
  blueInk: '#172554',
  blueStrong: '#1D4ED8',
  blueWash: '#DBEAFE',
  blueWashSoft: '#EEF4FF',
  bluePale: '#E8F0FF',
  green: '#16A34A',
  indigoAccent: '#6172F3',
  indigoSoft: '#C7D2FE',
  indigoBorder: '#E2E8F0',
  indigoDeep: '#312E81',
  indigoInk: '#1E1B4B',
  indigoMuted: '#353474',
  indigoStrong: '#3730A3',
  lavenderSoft: '#D6D9F9',
  navyBorder: '#1F2A44',
  navyCard: '#22304B',
  navyInk: '#091122',
  navyStrong: '#1D2F67',
  navySurface: '#101A31',
  orange: '#F97316',
  orangeText: '#C2410C',
  orangeWash: '#FFF7ED',
  purpleRow: '#F5F3FF',
  purpleRowSoft: '#F4F3FF',
  purpleBorder: '#DDD6FE',
  purpleDeep: '#2E2A67',
  purpleInk: '#282061',
  purpleSoft: '#D9D6FE',
  purpleTextSoft: '#EDE9FE',
  rankEliteAccent: '#38332A',
  rankEliteSoft: '#EFEBDF',
  rankIntroAccent: '#3E7E54',
  rankIntroSoft: '#E9F3EC',
  rankPacerAccent: '#5B3B78',
  rankPacerSoft: '#EFE8F4',
  rankRacerAccent: '#A6362F',
  rankRacerSoft: '#F7E9E7',
  rankRunnerAccent: '#9B7B23',
  rankRunnerSoft: '#F7F0D9',
  roseWash: '#FFF1F3',
  slateDark: '#0F172A',
  slateDeep: '#30394C',
  slateLabel: '#4A556F',
  slateMuted: '#334155',
  slateMutedDeep: '#3A435A',
  slatePanel: '#2A3347',
  slateSoft: '#374158',
  lightweightMatchBlue: '#1D1D4F',
  lightweightMatchRed: '#321321',
  podiumGold: '#F59E0B',
  podiumGoldSoft: '#FFF7CC',
  podiumGoldBorder: '#FACC15',
  podiumGoldText: '#B45309',
  podiumSilver: '#94A3B8',
  // Dedicated silver-row surface/border so the podium chip no longer borrows the
  // THEMED surfaceSoft/indigoBorder tokens — all three podium chips stay light
  // pastel in both modes (medal identity, same as gold/bronze).
  podiumSilverSoft: '#F8FAFC',
  podiumSilverBorder: '#E2E8F0',
  podiumSilverText: '#475467',
  podiumBronze: '#B45309',
  podiumBronzeSoft: '#FDEAD7',
  podiumBronzeBorder: '#D97706',
  podiumBronzeText: '#92400E',
  // Stable per-runner dot palette for the group race board. Assigned by a hash of the
  // participant id (NOT rank), so a runner keeps ONE color for the whole race — the dot
  // never recolors as ranks swap (the old isLeader→gold switch caused re-render churn).
  // 'me' stays brand purple + forfeited stays danger red (both are non-rank states).
  runnerDotTeal: '#2DD4BF',
  runnerDotSky: '#38BDF8',
  runnerDotOrange: '#FB923C',
  runnerDotPink: '#F472B6',
  runnerDotLime: '#A3E635',
  runnerDotAmber: '#FBBF24',
  runnerDotBorder: 'rgba(255, 255, 255, 0.55)',
  warning: '#F79009',
  warningBright: '#FEF08A',
  warningSoft: '#FEF3C7',
  warningText: '#B54708',
  adminSurface: '#F3F5F9',
  translucentWhite18: 'rgba(255,255,255,0.18)',
  pagerTabRipple: 'rgba(109,94,247,0.12)',
  matchResultWinBorder: 'rgba(129, 140, 248, 0.42)',
  matchResultWinBg: 'rgba(67, 56, 202, 0.24)',
  matchResultLoseBorder: 'rgba(244, 114, 182, 0.28)',
  matchResultLoseBg: 'rgba(136, 19, 55, 0.22)',
  // Solid, vivid fills for the dedicated 대결 결과 cards (ResultDuelCard sits on the LIGHT
  // app surface, so the translucent *Bg tints above wash out — these read as bold color).
  matchResultWinCardBg: '#6E66E8',
  matchResultWinCardBorder: '#C7D2FE',
  matchResultLoseCardBg: '#E86981',
  matchResultLoseCardBorder: '#FECDD3',
  matchResultCardLabel: 'rgba(255, 255, 255, 0.85)',
  matchResultCardBadgeBorder: 'rgba(255, 255, 255, 0.45)',
  matchResultDrawBorder: 'rgba(148, 163, 184, 0.32)',
  matchResultDrawBg: 'rgba(30, 41, 59, 0.72)',
  matchResultInProgressBg: 'rgba(15, 23, 42, 0.52)',
  groupResultRowBorder: 'rgba(255,255,255,0.06)',
  groupResultRowCurrentBorder: 'rgba(129, 140, 248, 0.48)',
  groupResultRowCurrentBg: 'rgba(67, 56, 202, 0.18)',
  groupResultRowInProgressBorder: 'rgba(148, 163, 184, 0.24)',
  groupResultRowInProgressBg: 'rgba(15, 23, 42, 0.42)',
  matchResultPanelHighlightBorder: 'rgba(129, 140, 248, 0.28)',
  matchResultPanelHighlightBg: 'rgba(79, 70, 229, 0.18)',
  raceBoardRowBorder: 'rgba(255,255,255,0.08)',
  raceBoardRowBg: 'rgba(15,23,42,0.82)',
  raceBoardCurrentBorder: 'rgba(129,140,248,0.82)',
  raceBoardCurrentBg: 'rgba(79,70,229,0.22)',
  raceBoardForfeitedBorder: 'rgba(248,113,113,0.5)',
  raceBoardForfeitedBg: 'rgba(127,29,29,0.22)',
  raceBoardPlaceholderBorder: 'rgba(148,163,184,0.32)',
  raceBoardPlaceholderBg: 'rgba(15,23,42,0.56)',
  raceBoardTrackLineBg: 'rgba(148,163,184,0.28)',
  raceBoardTrackProgressBg: 'rgba(109,94,247,0.46)',
  raceBoardTrackProgressCurrentBg: 'rgba(129,140,248,0.58)',
  raceBoardTrackProgressForfeitedBg: 'rgba(248,113,113,0.42)',
  raceBoardTrackProgressPlaceholderBg: 'rgba(148,163,184,0.34)',
} as const;

export type ThemeColorKey = keyof typeof LIGHT_COLORS;
export type ThemeColors = { [K in ThemeColorKey]: string };

// The dark counterparts. Only THEMED tokens are listed; everything else spreads
// through from LIGHT_COLORS unchanged (constant in both modes). Surfaces live in
// the brand's navy family (night #0B1020 region) with a visible elevation step
// between the app background and card backgrounds; the text ladder inverts
// lightness (primary near-white → placeholder dimmest); semantic hues keep their
// hue but brighten enough to hold contrast on navy.
const DARK_COLORS: ThemeColors = {
  ...LIGHT_COLORS,
  // Surfaces (elevation: surfaceApp < surfaceSubtleAlt(inset inputs) < surface(card)
  // < surfaceSoft/surfaceSubtle(inner sections) < surfaceMuted(secondary fills)).
  surfaceApp: '#0B1020',
  surface: '#161E36',
  surfaceSoft: '#1C2440',
  surfaceSubtle: '#1E2745',
  surfaceSubtleAlt: '#111930',
  surfaceMuted: '#242D4E',
  adminSurface: '#0D1526',
  inkPill: '#3E4678',
  // Text ladder (inverted lightness, lavender-gray family).
  textPrimary: '#F3F5FF',
  textHeading: '#F7F8FF',
  textSecondary: '#A6ADD3',
  textTertiary: '#7D85AD',
  textMuted: '#C7CDEC',
  textNeutral: '#98A0C6',
  // textPlaceholder stays constant: its only consumers are the pinned dark match
  // chips (inputs use textTertiary for placeholderTextColor).
  textStrongMuted: '#D6D9F9',
  // Borders / dividers.
  border: '#37406A',
  borderMuted: '#283053',
  borderSoft: '#232B4A',
  // Brand wash chips + their deep-accent text partners (lighten text, darken wash).
  brandSoft: '#1D2047',
  brandSoftBorder: '#343879',
  brandWash: '#232858',
  brandDeep: '#B7BEFF',
  brandStrong: '#AAB2FD',
  brandMuted: '#9AA1F2',
  purpleRow: '#231F50',
  purpleRowSoft: '#211E4B',
  purpleBorder: '#4A4496',
  purpleSoft: '#453F8F',
  indigoBorder: '#2D3560',
  // Semantic: green.
  successText: '#4ADE80',
  successStrong: '#34D399',
  successSoft: '#143D2A',
  successWash: '#1B4D33',
  successCard: '#102A1D',
  successCardSoft: '#112B1E',
  successCardBorder: '#20603E',
  // Semantic: red.
  danger: '#F97066',
  dangerBright: '#FF6F65',
  dangerWash: '#3B1418',
  roseWash: '#321723',
  // Semantic: orange/amber.
  warningText: '#FDB022',
  warningSoft: '#3A2B0B',
  orangeText: '#FDBA74',
  orangeWash: '#33200E',
  // Semantic: blue.
  blueAccent: '#6BA6FF',
  blueStrong: '#96B7FF',
  blueWashSoft: '#152238',
  bluePale: '#152647',
};

// Frozen light-palette constants for deliberately theme-INDEPENDENT styling (dark
// hero cards, live-match chrome, tier-pastel cards, white pills on dark chrome).
// Pointing at fixedColors.X documents "this surface/text does not follow the theme".
export const fixedColors: Readonly<ThemeColors> = Object.freeze({ ...LIGHT_COLORS });

export type ThemeMode = 'dark' | 'light';

// Fresh installs default to DARK.
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

let appliedThemeMode: ThemeMode = DEFAULT_THEME_MODE;

// MUTABLE on purpose (see header comment). Initialized to the dark palette so the
// default experience — and anything imported before the stored mode is read — is dark.
export const colors: ThemeColors = { ...DARK_COLORS };

// Mutates `colors` in place so every module-scope StyleSheet.create that runs AFTER
// this call bakes the requested palette. Must run before route modules are imported
// (the root layout's boot gate guarantees that ordering).
export function applyThemePalette(mode: ThemeMode) {
  appliedThemeMode = mode;
  Object.assign(colors, mode === 'light' ? LIGHT_COLORS : DARK_COLORS);
}

export function getAppliedThemeMode(): ThemeMode {
  return appliedThemeMode;
}

// Test-only view of both palettes (key parity / default assertions).
export function getThemePalettesForTest() {
  return { light: LIGHT_COLORS as ThemeColors, dark: DARK_COLORS };
}

export const spacing = {
  xxxs: 1,
  xxs: 2,
  xs: 3,
  sm: 4,
  md: 5,
  lg: 6,
  xl: 7,
  xxl: 8,
  s10: 10,
  s12: 12,
  s14: 14,
  s16: 16,
  s18: 18,
  s20: 20,
  s22: 22,
  s24: 24,
  s42: 42,
} as const;

export const radii = {
  xs: 6,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  cardLarge: 24,
  heroLg: 30,
  pill: 999,
} as const;

export const fontSizes = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  rank: 15,
  button: 16,
  large: 17,
  title: 18,
  display: 19,
  metric: 20,
  comingSoon: 22,
  summaryValue: 24,
  pageTitle: 28,
  metricLarge: 29,
  hero: 30,
  heroLarge: 36,
  authTitle: 32,
} as const;

export const fontWeights = {
  semibold: '600',
  bold: '700',
  extraBold: '800',
  black: '900',
} as const;
