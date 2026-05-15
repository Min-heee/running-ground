import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { liveMatchTrackingStyles as styles } from '@/features/runs/components/liveMatchTracking/styles';
import type { MatchStatusAlert } from '@/features/runs/components/liveMatchTracking/types';

export const LiveMatchActionSection = memo(function LiveMatchActionSection({
  alert,
  actionLabel,
  disabled,
  onPress,
}: {
  alert: MatchStatusAlert;
  actionLabel: string;
  disabled: boolean;
  onPress?: () => void;
}) {
  return (
    <View
      style={[
        styles.matchStatusBanner,
        alert.tone === 'danger'
          ? styles.matchStatusBannerDanger
          : alert.tone === 'warning'
            ? styles.matchStatusBannerWarning
            : styles.matchStatusBannerNeutral,
      ]}
    >
      <Text style={styles.matchStatusBannerTitle}>{alert.title}</Text>
      <Text style={styles.matchStatusBannerText}>{alert.summary}</Text>
      {onPress ? (
        <Pressable
          style={styles.matchStatusBannerAction}
          disabled={disabled}
          onPress={onPress}
        >
          <Text style={styles.matchStatusBannerActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});
