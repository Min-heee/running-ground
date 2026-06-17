import { SignupActionFooter } from './SignupActionFooter';
import { SignupAgreementSection } from './SignupAgreementSection';
import { SignupBirthDateSection } from './SignupBirthDateSection';
import type { SignupFormModel } from './types';

type SignupSubmitSectionProps = Pick<
  SignupFormModel,
  | 'birthDate'
  | 'catalogError'
  | 'catalogLoading'
  | 'error'
  | 'handleBirthDateChange'
  | 'handleSignup'
  | 'isPhoneVerified'
  | 'passwordReady'
  | 'requiredProfileReady'
  | 'signupReady'
  | 'submitting'
  | 'usernameReady'
>;

export function SignupSubmitSection({
  birthDate,
  catalogError,
  catalogLoading,
  error,
  handleBirthDateChange,
  handleSignup,
  isPhoneVerified,
  passwordReady,
  requiredProfileReady,
  signupReady,
  submitting,
  usernameReady,
}: SignupSubmitSectionProps) {
  return (
    <>
      <SignupBirthDateSection
        birthDate={birthDate}
        handleBirthDateChange={handleBirthDateChange}
        submitting={submitting}
      />
      <SignupAgreementSection
        isPhoneVerified={isPhoneVerified}
        passwordReady={passwordReady}
        requiredProfileReady={requiredProfileReady}
        usernameReady={usernameReady}
      />
      <SignupActionFooter
        catalogError={catalogError}
        catalogLoading={catalogLoading}
        error={error}
        handleSignup={handleSignup}
        signupReady={signupReady}
        submitting={submitting}
      />
    </>
  );
}
