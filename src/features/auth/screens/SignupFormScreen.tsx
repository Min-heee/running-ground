import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SignupFormContent } from '@/features/auth/components/signup/SignupFormContent';
import { useSignupForm } from '@/features/auth/hooks/useSignupForm';

export default function SignupFormScreen() {
  const form = useSignupForm();

  return (
    <Screen>
      <AuthHeader
        title="계정으로 회원가입"
        showBack
        backHref="/signup"
      />

      <Card>
        <SignupFormContent form={form} />
      </Card>
    </Screen>
  );
}
