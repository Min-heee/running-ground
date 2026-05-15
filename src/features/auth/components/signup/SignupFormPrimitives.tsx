import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { signupFormStyles as styles } from './signupFormStyles';

type InputProps = {
  label: string;
  helperText?: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

export function SignupInput({
  label,
  helperText,
  placeholder,
  secureTextEntry,
  keyboardType,
  value,
  onChangeText,
  editable = true,
  autoCapitalize,
}: InputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        style={[styles.input, !editable && styles.inputDisabled]}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
      />
    </View>
  );
}

export function ValidationItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <View style={styles.validationItem}>
      <View style={[styles.validationDot, complete ? styles.validationDotComplete : styles.validationDotPending]} />
      <Text style={[styles.validationText, complete ? styles.validationTextComplete : styles.validationTextPending]}>{label}</Text>
    </View>
  );
}

export function RegionPickerCard({
  title,
  selectedLabel,
  active,
  disabled = false,
  onPress,
  children,
}: {
  title: string;
  selectedLabel: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.regionPickerCard}>
      <Pressable
        style={[styles.regionPickerHeader, disabled && styles.disabledButton]}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.regionPickerHeaderCopy}>
          <Text style={styles.regionPickerTitle}>{title}</Text>
          <Text style={styles.regionPickerValue}>{selectedLabel}</Text>
        </View>
        <Text style={styles.regionPickerToggle}>{active ? '접기' : '열기'}</Text>
      </Pressable>
      {active ? <View style={styles.regionPickerContent}>{children}</View> : null}
    </View>
  );
}
