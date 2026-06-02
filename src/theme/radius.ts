export const radius = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radius;
