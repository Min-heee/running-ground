import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { LeagueMode } from '@/features/league/types/league';
import { colors, spacing, fontWeights, radii } from '@/theme/tokens';

type LeagueModeSwitchProps = {
  mode: LeagueMode;
  onChange: (mode: LeagueMode) => void;
};

export function LeagueModeSwitch({ mode, onChange }: LeagueModeSwitchProps) {
  return (
    <Card style={styles.modeCard}>
      <View style={styles.modeSwitch}>
        <ModeButton label="지역" mode="region" active={mode === 'region'} onSelect={onChange} />
        <ModeButton label="랭크" mode="rank" active={mode === 'rank'} onSelect={onChange} />
        <ModeButton label="오늘" mode="today" active={mode === 'today'} onSelect={onChange} />
      </View>
    </Card>
  );
}

type ModeButtonProps = {
  label: string;
  active: boolean;
  mode: LeagueMode;
  onSelect: (mode: LeagueMode) => void;
};

const ModeButton = memo(function ModeButton({
  active,
  label,
  mode,
  onSelect,
}: ModeButtonProps) {
  const handlePress = useCallback(() => {
    onSelect(mode);
  }, [mode, onSelect]);
  const modeButtonStyle = useMemo(() => [styles.modeButton, active && styles.modeButtonActive], [active]);
  const modeButtonTextStyle = useMemo(() => [styles.modeButtonText, active && styles.modeButtonTextActive], [active]);

  return (
    <Pressable style={modeButtonStyle} onPress={handlePress}>
      <Text style={modeButtonTextStyle}>{label}</Text>
    </Pressable>
  );
});

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
