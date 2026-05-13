import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { API_CONFIG, checkApiHealth, normalizeUsername, signIn } from '@/services/authService';

type ServerCheckState = {
  status: 'idle' | 'checking' | 'ok' | 'error';
  message: string;
};

export function useLoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverCheck, setServerCheck] = useState<ServerCheckState>({
    status: 'idle',
    message: `API: ${API_CONFIG.baseUrl}`,
  });
  const normalizedUsername = normalizeUsername(username);
  const loginReady = Boolean(normalizedUsername && password.trim());

  const handleCheckServer = async () => {
    setServerCheck({
      status: 'checking',
      message: `서버 연결을 확인하고 있어요. API: ${API_CONFIG.baseUrl}`,
    });

    try {
      const payload = await checkApiHealth();

      if (payload?.status !== 'ok') {
        throw new Error(payload?.message ?? 'health check failed');
      }

      setServerCheck({
        status: 'ok',
        message: `서버 연결 정상 · ${payload.publicBaseUrl ?? API_CONFIG.baseUrl}`,
      });
    } catch (checkError) {
      setServerCheck({
        status: 'error',
        message: checkError instanceof Error
          ? `서버 연결 실패 · ${checkError.message} · API: ${API_CONFIG.baseUrl}`
          : `서버 연결 실패 · API: ${API_CONFIG.baseUrl}`,
      });
    }
  };

  useEffect(() => {
    handleCheckServer();
  }, []);

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
      setError(loginError instanceof Error ? loginError.message : '로그인에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUsernameChange = (nextValue: string) => {
    setUsername(nextValue.trim().toLowerCase());
  };

  return {
    error,
    handleCheckServer,
    handleLogin,
    handleUsernameChange,
    loginReady,
    password,
    passwordVisible,
    serverCheck,
    setPassword,
    setPasswordVisible,
    submitting,
    username,
  };
}
