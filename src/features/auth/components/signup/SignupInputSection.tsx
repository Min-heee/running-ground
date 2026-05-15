import { SignupCredentialsSection } from './SignupCredentialsSection';
import { SignupProfileSection } from './SignupProfileSection';
import type { SignupFormModel } from './types';

type SignupInputSectionProps = Pick<
  SignupFormModel,
  | 'checkingUsername'
  | 'displayNamePreference'
  | 'handleCheckUsername'
  | 'handlePhoneChange'
  | 'handleUsernameChange'
  | 'nickname'
  | 'password'
  | 'passwordConfirm'
  | 'passwordConfirmMessage'
  | 'passwordReady'
  | 'passwordValidationMessage'
  | 'passwordVisible'
  | 'phone'
  | 'publicDisplayName'
  | 'realName'
  | 'setDisplayNamePreference'
  | 'setNickname'
  | 'setPassword'
  | 'setPasswordConfirm'
  | 'setPasswordVisible'
  | 'setRealName'
  | 'submitting'
  | 'username'
  | 'usernameCheck'
  | 'usernameReady'
  | 'usernameValidationMessage'
>;

export function SignupInputSection(props: SignupInputSectionProps) {
  return (
    <>
      <SignupProfileSection
        displayNamePreference={props.displayNamePreference}
        nickname={props.nickname}
        publicDisplayName={props.publicDisplayName}
        realName={props.realName}
        setDisplayNamePreference={props.setDisplayNamePreference}
        setNickname={props.setNickname}
        setRealName={props.setRealName}
        submitting={props.submitting}
      />

      <SignupCredentialsSection
        checkingUsername={props.checkingUsername}
        handleCheckUsername={props.handleCheckUsername}
        handlePhoneChange={props.handlePhoneChange}
        handleUsernameChange={props.handleUsernameChange}
        password={props.password}
        passwordConfirm={props.passwordConfirm}
        passwordConfirmMessage={props.passwordConfirmMessage}
        passwordReady={props.passwordReady}
        passwordValidationMessage={props.passwordValidationMessage}
        passwordVisible={props.passwordVisible}
        phone={props.phone}
        setPassword={props.setPassword}
        setPasswordConfirm={props.setPasswordConfirm}
        setPasswordVisible={props.setPasswordVisible}
        submitting={props.submitting}
        username={props.username}
        usernameCheck={props.usernameCheck}
        usernameReady={props.usernameReady}
        usernameValidationMessage={props.usernameValidationMessage}
      />
    </>
  );
}
