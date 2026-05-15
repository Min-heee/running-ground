import { StyleSheet } from 'react-native';

export const liveMatchPagerStyles = StyleSheet.create({
  shell: {
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  tabSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
  },
  tabTextSelected: {
    color: '#4F46E5',
  },
  page: {
    gap: 14,
    paddingRight: 0,
  },
  androidPage: {
    gap: 14,
  },
  hint: {
    color: '#98A2B3',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
});
