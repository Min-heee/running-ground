import { SignupActionFooter } from './SignupActionFooter';
import { SignupAgreementSection } from './SignupAgreementSection';
import type { SignupFormModel } from './types';

type SignupSubmitSectionProps = Pick<
  SignupFormModel,
  | 'catalogError'
  | 'catalogLoading'
  | 'error'
  | 'handleSignup'
  | 'isPhoneVerified'
  | 'passwordReady'
  | 'requiredProfileReady'
  | 'signupReady'
  | 'submitting'
  | 'usernameReady'
>;

export function SignupSubmitSection({
  catalogError,
  catalogLoading,
  error,
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
