import { Fragment, memo, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { styles } from './adminStyles';
import { colors } from '@/theme/tokens';

function AdminListSeparator() {
  return <View style={styles.listSeparator} />;
}

export const ToggleChip = memo(function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const chipStyle = useMemo(() => [
    styles.toggleChip,
    active ? styles.toggleChipActive : null,
  ], [active]);
  const textStyle = useMemo(() => [
    styles.toggleChipText,
    active ? styles.toggleChipTextActive : null,
  ], [active]);

  return (
    <Pressable style={chipStyle} onPress={onPress}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
});

export const ActionButton = memo(function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const buttonStyle = useMemo(() => [
    styles.actionButton,
    variant === 'secondary' ? styles.actionButtonSecondary : null,
    variant === 'danger' ? styles.actionButtonDanger : null,
    disabled ? styles.actionButtonDisabled : null,
  ], [disabled, variant]);
  const textStyle = useMemo(() => [
    styles.actionButtonText,
    variant === 'secondary' ? styles.actionButtonTextSecondary : null,
  ], [variant]);

  return (
    <Pressable
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
});

export const MetricCard = memo(function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
});

export const Field = memo(function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const inputStyle = useMemo(() => [
    styles.input,
    multiline ? styles.textArea : null,
  ], [multiline]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
});

export const SearchInput = memo(function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
    />
  );
});

export const FormGrid = memo(function FormGrid({
  children,
  isMedium = false,
}: {
  children: ReactNode;
  isMedium?: boolean;
}) {
  const formGridStyle = useMemo(() => [
    styles.formGrid,
    isMedium ? styles.formGridTwoColumns : null,
  ], [isMedium]);

  return <View style={formGridStyle}>{children}</View>;
});

export const StatusBadge = memo(function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'muted';
}) {
  const badgeStyle = useMemo(() => [
    styles.statusBadge,
    tone === 'success' ? styles.statusBadgeSuccess : null,
    tone === 'muted' ? styles.statusBadgeMuted : null,
  ], [tone]);
  const textStyle = useMemo(() => [
    styles.statusBadgeText,
    tone === 'success' ? styles.statusBadgeTextSuccess : null,
    tone === 'muted' ? styles.statusBadgeTextMuted : null,
  ], [tone]);

  return (
    <View style={badgeStyle}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
});

export function AdminList<T>({
  data,
  emptyText,
  keyExtractor,
  renderItem,
}: {
  data: T[];
  emptyText: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
}) {
  if (data.length === 0) {
    return (
      <View style={styles.listStack}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.listStack}>
      {data.map((item, index) => (
        <Fragment key={keyExtractor(item)}>
          {index > 0 ? <AdminListSeparator /> : null}
          {renderItem(item)}
        </Fragment>
      ))}
    </View>
  );
}
