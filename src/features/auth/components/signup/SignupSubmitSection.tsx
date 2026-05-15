import { SignupActionFooter } from './SignupActionFooter';
import { SignupAgreementSection } from './SignupAgreementSection';
import { SignupBirthDateSection } from './SignupBirthDateSection';
import { SignupUniversityRegionGuideSection } from './SignupUniversityRegionGuideSection';
import type { SignupFormModel } from './types';

type SignupSubmitSectionProps = Pick<
  SignupFormModel,
  | 'birthDate'
  | 'catalogError'
  | 'catalogLoading'
  | 'error'
  | 'handleBirthDateChange'
  | 'handleSignup'
  | 'normalizedPhone'
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
  normalizedPhone,
  passwordReady,
  requiredProfileReady,
  signupReady,
  submitting,
  usernameReady,
}: SignupSubmitSectionProps) {
  return (
    <>
      <SignupUniversityRegionGuideSection />
      <SignupBirthDateSection
        birthDate={birthDate}
        handleBirthDateChange={handleBirthDateChange}
        submitting={submitting}
      />
      <SignupAgreementSection
        normalizedPhone={normalizedPhone}
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
