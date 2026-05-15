import { StyleSheet } from 'react-native';

export const liveMatchRaceBoardStyles = StyleSheet.create({
  card: {
    gap: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#1F2A44',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  eyebrow: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#E5E7EB',
    fontSize: 17,
    lineHeight: 27,
  },
  rowsScroller: {
    maxHeight: 420,
  },
  rows: {
    gap: 14,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 104,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  rowCurrent: {
    borderColor: 'rgba(129,140,248,0.82)',
    backgroundColor: 'rgba(79,70,229,0.22)',
  },
  rowForfeited: {
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(127,29,29,0.22)',
  },
  nameColumn: {
    width: 64,
    gap: 4,
  },
  rankText: {
    color: '#A5B4FC',
    fontSize: 16,
    fontWeight: '800',
  },
  rankTextForfeited: {
    color: '#FCA5A5',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
  },
  nameTextCurrent: {
    color: '#E0E7FF',
  },
  nameTextForfeited: {
    color: '#FECACA',
  },
  trackColumn: {
    flex: 1,
    minWidth: 106,
  },
  trackStack: {
    position: 'relative',
    height: 48,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  trackLine: {
    position: 'relative',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(109,94,247,0.46)',
  },
  trackProgressCurrent: {
    backgroundColor: 'rgba(129,140,248,0.58)',
  },
  trackProgressForfeited: {
    backgroundColor: 'rgba(248,113,113,0.42)',
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 6,
    borderColor: '#6D5EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDotCurrent: {
    borderColor: '#7C6DFF',
  },
  trackDotForfeited: {
    width: 38,
    height: 38,
    marginTop: -19,
    marginLeft: -19,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  trackDotForfeitedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  distanceText: {
    position: 'absolute',
    top: 28,
    color: '#E0E7FF',
    fontSize: 18,
    fontWeight: '800',
  },
  distanceTextCentered: {
    transform: [{ translateX: -34 }],
  },
  distanceTextNearStart: {
    transform: [{ translateX: -10 }],
  },
  distanceTextNearFinish: {
    transform: [{ translateX: -64 }],
  },
  metaColumn: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaRemaining: {
    color: '#CBD5E1',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: '#FCA5A5',
  },
});
