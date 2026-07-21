import { getAccessToken } from '@/lib/session';

export async function requireAccessToken() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('로그인이 필요해요.');
  }

  return accessToken;
}
