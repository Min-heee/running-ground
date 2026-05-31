export type MatchSetupTabKey = 'distance' | 'date' | 'time';

const DEFAULT_MATCH_SETUP_TAB: MatchSetupTabKey = 'date';
const activeTabByKey = new Map<string, MatchSetupTabKey>();

export function getMatchSetupActiveTab(key: string): MatchSetupTabKey {
  return activeTabByKey.get(key) ?? DEFAULT_MATCH_SETUP_TAB;
}

export function setMatchSetupActiveTab(key: string, tab: MatchSetupTabKey) {
  activeTabByKey.set(key, tab);
}

export function resetMatchSetupActiveTabsForTest() {
  activeTabByKey.clear();
}
