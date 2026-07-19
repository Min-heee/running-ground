import { useState } from 'react';
import { router } from 'expo-router';
import { getApiErrorMessage } from '@/services/apiError';
import { normalizeUsername, signIn } from '@/services/authService';

export function useLoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedUsername = normalizeUsername(username);
  const loginReady = Boolean(normalizedUsername && password.trim());

  const handleLogin = async () => {
    if (!loginReady || submitting) {
      setError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await signIn({ username, password });
      router.replace('/(tabs)/home');
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, '로그인에 실패했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUsernameChange = (nextValue: string) => {
    setUsername(nextValue.trim().toLowerCase());
  };

  return {
    error,
    handleLogin,
    handleUsernameChange,
    loginReady,
    password,
    passwordVisible,
    setPassword,
    setPasswordVisible,
    submitting,
    username,
  };
}
