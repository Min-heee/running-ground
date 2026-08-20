export {
  checkApiHealth,
  API_CONFIG,
} from './apiClient';

// 순환 import 차단 (2026-08-15): 세션 배럴(@/lib/session)을 재수출하면
// session → authSessionFacade → push/pushRegistration → @/services → authService →
// session 으로 고리가 닫혀, 웹 번들이 초기화 도중 배럴을 undefined로 읽고 크래시했다.
// 구체 모듈을 직접 가리키면 어느 경로로 들어와도 배럴을 되밟지 않는다.
export {
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
  PASSWORD_RULE_DESCRIPTION,
  USERNAME_RULE_DESCRIPTION,
} from '@/lib/session/validation';
export {
  getAccessToken,
  getCurrentUserProfile,
  getIsSignedIn,
  hydrateSession,
  setCurrentUserProfile,
} from '@/lib/session/sessionState';
export {
  deleteAccount,
  signIn,
  signInWithProvider,
  signOut,
} from '@/lib/session/authSessionFacade';
export {
  checkUsernameAvailability,
  registerAccount,
  requestSignupPhoneVerification,
  verifySignupPhoneCode,
} from '@/lib/session/signupSessionActions';
export {
  findUsernameByIdentity,
  resetPasswordByIdentity,
} from '@/lib/session/accountRecoveryActions';
