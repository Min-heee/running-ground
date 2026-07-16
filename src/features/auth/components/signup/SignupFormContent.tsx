import { ActivityIndicator, Text, View } from 'react-native';
import { SignupInputSection } from './SignupInputSection';
import { SignupRegionSection } from './SignupRegionSection';
import { SignupSubmitSection } from './SignupSubmitSection';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';
import { colors } from '@/theme/tokens';

export function SignupFormContent({ form }: { form: SignupFormModel }) {
  return (
    <View style={styles.form}>
      {form.catalogLoading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      {form.catalogError ? <Text style={styles.errorText}>{form.catalogError}</Text> : null}

      <SignupInputSection
        checkingUsername={form.checkingUsername}
        displayNamePreference={form.displayNamePreference}
        handleCheckUsername={form.handleCheckUsername}
        handlePhoneChange={form.handlePhoneChange}
        handlePhoneVerificationCodeChange={form.handlePhoneVerificationCodeChange}
        handleRequestPhoneCode={form.handleRequestPhoneCode}
        handleUsernameChange={form.handleUsernameChange}
        handleVerifyPhoneCode={form.handleVerifyPhoneCode}
        isPhoneVerified={form.isPhoneVerified}
        isRequestingPhoneCode={form.isRequestingPhoneCode}
        isVerifyingPhoneCode={form.isVerifyingPhoneCode}
        nickname={form.nickname}
        password={form.password}
        passwordConfirm={form.passwordConfirm}
        passwordConfirmMessage={form.passwordConfirmMessage}
        passwordReady={form.passwordReady}
        passwordValidationMessage={form.passwordValidationMessage}
        passwordVisible={form.passwordVisible}
        phone={form.phone}
        phoneResendCooldown={form.phoneResendCooldown}
        phoneValid={form.phoneValid}
        phoneVerificationCode={form.phoneVerificationCode}
        phoneVerificationError={form.phoneVerificationError}
        phoneVerificationRequestId={form.phoneVerificationRequestId}
        publicDisplayName={form.publicDisplayName}
        realName={form.realName}
        setDisplayNamePreference={form.setDisplayNamePreference}
        setNickname={form.setNickname}
        setPassword={form.setPassword}
        setPasswordConfirm={form.setPasswordConfirm}
        setPasswordVisible={form.setPasswordVisible}
        setRealName={form.setRealName}
        submitting={form.submitting}
        username={form.username}
        usernameCheck={form.usernameCheck}
        usernameReady={form.usernameReady}
        usernameValidationMessage={form.usernameValidationMessage}
      />

      <SignupRegionSection
        catalogLoading={form.catalogLoading}
        handleSelectProvince={form.handleSelectProvince}
        handleSelectSecondary={form.handleSelectSecondary}
        openRegionStep={form.openRegionStep}
        provinceName={form.provinceName}
        regions={form.regions}
        secondaryOptions={form.secondaryOptions}
        secondaryRegionName={form.secondaryRegionName}
        selectedAddressLabel={form.selectedAddressLabel}
        selectedProvince={form.selectedProvince}
        setOpenRegionStep={form.setOpenRegionStep}
        submitting={form.submitting}
      />

      <SignupSubmitSection
        catalogError={form.catalogError}
        catalogLoading={form.catalogLoading}
        error={form.error}
        handleSignup={form.handleSignup}
        isPhoneVerified={form.isPhoneVerified}
        passwordReady={form.passwordReady}
        requiredProfileReady={form.requiredProfileReady}
        signupReady={form.signupReady}
        submitting={form.submitting}
        usernameReady={form.usernameReady}
      />
    </View>
  );
}
