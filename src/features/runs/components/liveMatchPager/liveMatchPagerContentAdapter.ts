export function shouldRenderLiveMatchScrollPage({
  index,
  page,
  hasResultPage,
}: {
  index: number;
  page: number;
  hasResultPage: boolean;
}) {
  if (index === 3) {
    return hasResultPage && page === 3;
  }

  return page === index;
}
