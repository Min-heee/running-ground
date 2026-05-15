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
        subtitle="기본 정보만 입력하면 바로 홈으로 들어갈 수 있어요."
        showBack
        backHref="/signup"
      />

      <Card>
        <SignupFormContent form={form} />
      </Card>
    </Screen>
  );
}
