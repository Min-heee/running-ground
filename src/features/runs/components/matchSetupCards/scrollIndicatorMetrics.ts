type ScrollIndicatorMetricsInput = {
  contentWidth: number;
  visibleWidth: number;
  trackWidth: number;
  minThumbWidth?: number;
};

type ScrollIndicatorMetrics = {
  visible: boolean;
  thumbWidth: number;
  maxScroll: number;
  maxThumbTranslateX: number;
};

function toPositiveFiniteNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveScrollIndicatorMetrics({
  contentWidth,
  visibleWidth,
  trackWidth,
  minThumbWidth = 24,
}: ScrollIndicatorMetricsInput): ScrollIndicatorMetrics {
  const safeContentWidth = toPositiveFiniteNumber(contentWidth);
  const safeVisibleWidth = toPositiveFiniteNumber(visibleWidth);
  const safeTrackWidth = toPositiveFiniteNumber(trackWidth);
  const safeMinThumbWidth = toPositiveFiniteNumber(minThumbWidth);
  const maxScroll = Math.max(0, safeContentWidth - safeVisibleWidth);

  if (maxScroll <= 0 || safeTrackWidth <= 0 || safeVisibleWidth <= 0 || safeContentWidth <= 0) {
    return {
      visible: false,
      thumbWidth: 0,
      maxScroll,
      maxThumbTranslateX: 0,
    };
  }

  const proportionalThumbWidth = safeTrackWidth * (safeVisibleWidth / safeContentWidth);
  const thumbWidth = clamp(
    proportionalThumbWidth,
    Math.min(safeMinThumbWidth, safeTrackWidth),
    safeTrackWidth,
  );

  return {
    visible: true,
    thumbWidth,
    maxScroll,
    maxThumbTranslateX: Math.max(0, safeTrackWidth - thumbWidth),
  };
}
