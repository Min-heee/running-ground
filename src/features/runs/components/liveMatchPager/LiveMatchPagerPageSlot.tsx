import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { LiveMatchPageRenderer } from '@/features/runs/components/liveMatchPager/types';

export const EMPTY_PAGE_RENDERER: LiveMatchPageRenderer = () => null;

export const LiveMatchPagerPageSlot = memo(function LiveMatchPagerPageSlot({
  shouldRender,
  pageStyle,
  renderPage,
}: {
  shouldRender: boolean;
  pageStyle: StyleProp<ViewStyle>;
  renderPage: LiveMatchPageRenderer;
}) {
  return (
    <View style={pageStyle}>
      {shouldRender ? renderPage() : null}
    </View>
  );
}, (prevProps, nextProps) => {
  if (!prevProps.shouldRender && !nextProps.shouldRender) {
    return prevProps.pageStyle === nextProps.pageStyle;
  }

  return (
    prevProps.shouldRender === nextProps.shouldRender
    && prevProps.pageStyle === nextProps.pageStyle
    && prevProps.renderPage === nextProps.renderPage
  );
});
