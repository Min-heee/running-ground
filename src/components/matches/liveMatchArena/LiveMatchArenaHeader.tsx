import { memo } from 'react';
import { Text } from 'react-native';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';

type LiveMatchArenaHeaderProps = {
  mode: 'duel' | 'group';
  title: string;
  subtitle: string;
};

export const LiveMatchArenaHeader = memo(function LiveMatchArenaHeader({
  mode,
  title,
  subtitle,
}: LiveMatchArenaHeaderProps) {
  return (
    <>
      <Text style={styles.eyebrow}>{mode === 'duel' ? 'DUEL ROAD' : 'GROUP ROAD'}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </>
  );
});
