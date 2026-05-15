import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { VERIFICATION_METHODS } from '@/features/auth/utils/universityVerification';
import { universityVerificationStyles as styles } from './universityVerificationStyles';
import type { UniversityVerificationModel } from './types';

export const VerificationMethodButton = memo(function VerificationMethodButton({
  method,
  onSelectMethod,
  selected,
}: {
  method: typeof VERIFICATION_METHODS[number];
  onSelectMethod: UniversityVerificationModel['handleSelectMethod'];
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onSelectMethod(method.id);
  }, [method.id, onSelectMethod]);

  return (
    <Pressable
      style={[styles.methodPickerButton, selected ? styles.methodPickerButtonSelected : null]}
      onPress={handlePress}
    >
      <Text style={[styles.methodPickerButtonTitle, selected ? styles.methodPickerButtonTitleSelected : null]}>
        {method.title}
      </Text>
      <Text style={[styles.methodPickerButtonSummary, selected ? styles.methodPickerButtonSummarySelected : null]}>
        {method.id === 'certificate' ? '운영 검토형' : '간편 인증형'}
      </Text>
    </Pressable>
  );
});

export const UniversitySuggestionChip = memo(function UniversitySuggestionChip({
  onSelectUniversity,
  selected,
  university,
}: {
  onSelectUniversity: UniversityVerificationModel['handleUniversityQueryChange'];
  selected: boolean;
  university: string;
}) {
  const handlePress = useCallback(() => {
    onSelectUniversity(university);
  }, [onSelectUniversity, university]);

  return (
    <Pressable
      style={[styles.suggestionChip, selected ? styles.suggestionChipSelected : null]}
      onPress={handlePress}
    >
      <Text style={[styles.suggestionChipText, selected ? styles.suggestionChipTextSelected : null]}>
        {university}
      </Text>
    </Pressable>
  );
});

export const VerificationStepRow = memo(function VerificationStepRow({
  index,
  step,
}: {
  index: number;
  step: string;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepDot}>
        <Text style={styles.stepDotText}>{index + 1}</Text>
      </View>
      <Text style={styles.stepText}>{step}</Text>
    </View>
  );
});
