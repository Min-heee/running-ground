import { Platform } from 'react-native';
import {
  requestMotion,
  requestNotifications,
  type OnboardingPermissionKey,
} from '@/features/auth/onboarding/onboardingPermissions';

export type TourStep = 'welcome' | 'permissions' | 'connect';

export const STEP_ORDER: TourStep[] = ['welcome', 'permissions', 'connect'];

export type PermissionItem = {
  key: OnboardingPermissionKey;
  label: string;
  hint: string;
  request: () => Promise<boolean>;
};

// 위치 권한은 fg + bg("항상")를 하나의 행으로 합쳐 별도로 렌더해요 (PermissionsStepCard 본문 참고). 여기엔
// 알림·동작만 두고, 각 행은 자기 권한의 OS 다이얼로그만 띄워요.
export const PERMISSION_ITEMS: PermissionItem[] = [
  {
    key: 'notifications',
    label: '알림',
    hint: '대결 초대와 시작·중간 차이 알림을 받을 수 있어요.',
    request: requestNotifications,
  },
  {
    key: 'motion',
    label: '동작·피트니스',
    hint: '걸음 수로 케이던스(분당 걸음)를 보여줘요.',
    request: requestMotion,
  },
];

// 연동 카드는 별도 단계(STEP 2)지만, 헬스 연동도 같은 “허용/연동” UX로 인라인 처리해요.
export const HEALTH_ITEM: { key: OnboardingPermissionKey; label: string; hint: string } = {
  key: 'health',
  label: Platform.OS === 'android' ? 'Health Connect 연동' : 'Apple 건강 연동',
  hint: Platform.OS === 'android'
    ? 'Health Connect의 러닝 기록을 가져와 한 곳에 모아요.'
    : 'Apple 건강의 러닝 기록을 가져와 한 곳에 모아요.',
};
