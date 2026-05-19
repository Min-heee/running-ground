import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { LeagueMode } from '@/features/league/types/league';
import { colors, fontWeights, radii, spacing } from '@/theme/tokens';

type LeagueModeSwitchProps = {
  mode: LeagueMode;
  onChange: (mode: LeagueMode) => void;
};

export function LeagueModeSwitch({ mode, onChange }: LeagueModeSwitchProps) {
  const isTodayView = mode === 'today';

  return (
    <Card style={styles.modeCard}>
      <View style={styles.modeSwitch}>
        <Pressable style={[styles.modeButton, !isTodayView && styles.modeButtonActive]} onPress={() => onChange('region')}>
          <Text style={[styles.modeButtonText, !isTodayView && styles.modeButtonTextActive]}>지역</Text>
        </Pressable>
        <Pressable style={[styles.modeButton, isTodayView && styles.modeButtonActive]} onPress={() => onChange('today')}>
          <Text style={[styles.modeButtonText, isTodayView && styles.modeButtonTextActive]}>오늘</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  modeCard: {
    padding: spacing.lg,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.lg,
  },
  modeButton: {
    flex: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.s12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
  },
  modeButtonText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  modeButtonTextActive: {
    color: colors.textPrimary,
  },
});
