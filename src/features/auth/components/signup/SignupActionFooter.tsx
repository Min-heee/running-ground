import { ActivityIndicator, Pressable, Text } from 'react-native';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';
import { colors } from '@/theme/tokens';

type SignupActionFooterProps = Pick<
  SignupFormModel,
  | 'catalogError'
  | 'catalogLoading'
  | 'error'
  | 'handleSignup'
  | 'signupReady'
  | 'submitting'
>;

export function SignupActionFooter({
  catalogError,
  catalogLoading,
  error,
  handleSignup,
  signupReady,
  submitting,
}: SignupActionFooterProps) {
  const disabled = submitting || catalogLoading || Boolean(catalogError) || !signupReady;

  return (
    <>
      <Pressable
        style={[styles.primaryButton, disabled ? styles.disabledButton : null]}
        onPress={handleSignup}
        disabled={disabled}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.primaryButtonText}>{signupReady ? '회원가입하고 시작' : '필수 정보 확인 필요'}</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );
}
