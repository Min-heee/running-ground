export const colors = {
  brandPrimary: '#6D5EF7',
  brandPrimaryDark: '#4F46E5',
  brandPrimarySoft: '#EEF2FF',
  brandPrimaryMuted: '#C7D2FE',
  brandPrimaryTint: '#E9E7FF',
  brandPrimaryGhost: '#F8F7FF',
  brandPrimaryAlt: '#F5F3FF',
  brandPrimaryRipple: 'rgba(109, 94, 247, 0.15)',
  overlayWhiteSoft: 'rgba(255, 255, 255, 0.14)',
  brandPrimaryDeep: '#DDD6FE',
  brandPrimaryOnDark: '#C7D2FE',
  brandPrimaryHero: '#F4F3FF',

  inkBg: '#111827',
  inkBgAlt: '#1F2937',
  inkBgDeep: '#111111',

  surfaceApp: '#F5F7FB',
  surfaceCard: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
  surfaceSubtle: '#F2F4F7',

  textPrimary: '#111827',
  textTitle: '#101828',
  textSecondary: '#475467',
  textBody: '#344054',
  textMuted: '#667085',
  textPlaceholder: '#98A2B3',

  white: '#FFFFFF',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#D0D5DD',
  textOnDarkSubtle: '#98A2B3',

  borderSubtle: '#EAECF0',
  border: '#D0D5DD',
  borderInput: '#E5E7EB',

  danger: '#F04438',
  dangerText: '#B42318',
  dangerBg: '#FEF3F2',
  dangerBorder: '#FECDCA',

  success: '#067647',
  successBg: '#ECFDF3',

  warningBg: '#FFF7ED',
  warningText: '#C2410C',

  providerKakao: '#FEE500',
  providerNaver: '#03C75A',
  providerApple: '#111111',
  providerGoogle: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
