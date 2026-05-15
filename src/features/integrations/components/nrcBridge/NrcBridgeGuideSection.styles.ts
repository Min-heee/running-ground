import { StyleSheet } from 'react-native';

export const nrcBridgeGuideSectionStyles = StyleSheet.create({
  group: {
    gap: 12,
  },
});

export const nrcBridgeGuideDetailStyles = StyleSheet.create({
  card: {
    gap: 14,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  accordionMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: '#101828',
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 28,
  },
  toggleText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
    gap: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#667085',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#101828',
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepMarkerText: {
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: 12,
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: '#111827',
    fontWeight: '700',
  },
  stepDescription: {
    color: '#475467',
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  footnote: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
});
