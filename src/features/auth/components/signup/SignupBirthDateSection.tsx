import { SignupInput } from './SignupFormPrimitives';
import type { SignupFormModel } from './types';

type SignupBirthDateSectionProps = Pick<
  SignupFormModel,
  | 'birthDate'
  | 'handleBirthDateChange'
  | 'submitting'
>;

export function SignupBirthDateSection({
  birthDate,
  handleBirthDateChange,
  submitting,
}: SignupBirthDateSectionProps) {
  return (
    <SignupInput
      label="생년월일"
      helperText="비공개 정보예요. YYYY-MM-DD 형식으로 저장돼요."
      placeholder="예: 1990-01-01"
      value={birthDate}
      onChangeText={handleBirthDateChange}
      editable={!submitting}
    />
  );
}
