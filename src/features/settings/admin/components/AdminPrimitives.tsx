import type { ReactElement } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { styles } from './adminStyles';

export function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.toggleChip, active ? styles.toggleChipActive : null]} onPress={onPress}>
      <Text style={[styles.toggleChipText, active ? styles.toggleChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
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
  return (
    <Pressable
      style={[
        styles.actionButton,
        variant === 'secondary' ? styles.actionButtonSecondary : null,
        variant === 'danger' ? styles.actionButtonDanger : null,
        disabled ? styles.actionButtonDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'secondary' ? styles.actionButtonTextSecondary : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MetricCard({
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
}

export function Field({
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
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.textArea : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export function SearchInput({
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
      placeholderTextColor="#98A2B3"
    />
  );
}

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
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => renderItem(item)}
      scrollEnabled={false}
      contentContainerStyle={styles.listStack}
      ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
    />
  );
}
