// Pure sync helper for the live-match pager's LOCAL active-tab highlight.
//
// The tab highlight is driven by a local state that is set SYNCHRONOUSLY on
// press so it never waits on the JS-thread-saturated parent re-render (the heavy
// page-content commit is deferred via startTransition on Android). This helper
// keeps that local value reconciled with the real `page` prop: when the page
// changes EXTERNALLY (auto-switch to 결과 보기 on finish, an iOS swipe, or a
// remount), the local highlight must follow so it never strands out of sync.

export function resolveSyncedActiveTab(localActiveTab: number, page: number): number {
  // The real page is the source of truth on any external change. A synchronous
  // local press optimistically moves the highlight ahead of the deferred page
  // commit, but once the page prop catches up (or diverges externally) we snap
  // the local highlight back onto it so the two never permanently disagree.
  return localActiveTab === page ? localActiveTab : page;
}
