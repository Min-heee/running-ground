import { Platform } from 'react-native';

import type { NativeHealthImportResult } from '@/integrations/nativeHealth';
import type { IntegrationSyncResponse } from '@/lib/api/types';

// HealthKit never tells us whether a 0-result read means "no runs" or
// "permission was silently denied", so on iOS we must steer the user to check
// permissions / that their running app actually saved to Apple 건강.
const IOS_ZERO_IMPORT_HINT =
  '가져온 기록이 없어. 건강 앱 권한(설정 > 개인정보 보호 > 건강)을 확인하거나, 러닝 앱이 건강에 기록을 저장했는지 봐줘.';
const ANDROID_ZERO_IMPORT_HINT =
  '가져온 기록이 없어. Health Connect 권한을 확인하거나, 러닝 앱이 Health Connect에 기록을 저장했는지 봐줘.';

export function buildZeroImportGuidance() {
  return Platform.OS === 'ios' ? IOS_ZERO_IMPORT_HINT : ANDROID_ZERO_IMPORT_HINT;
}

export function buildSyncSummary(result: IntegrationSyncResponse) {
  if (result.importedRuns === 0 && result.duplicateRuns > 0) {
    return `이미 가져온 기록만 있어서 업데이트할 게 없었어. 마지막 확인 시각은 ${result.lastSyncedAt} 이야.`;
  }

  if (result.importedRuns > 0 && result.duplicateRuns > 0) {
    return `${result.importedRuns}개 기록을 새로 반영했고, ${result.duplicateRuns}개는 이미 가져온 기록이라 건너뛰었어.`;
  }

  if (result.importedRuns > 0) {
    return `${result.importedRuns}개 기록을 새로 반영했어.`;
  }

  return `${result.syncedSources}개 소스를 확인했지만 아직 새로 반영할 기록은 없었어.`;
}

export function buildImportDiagnosisHint(result: NativeHealthImportResult) {
  if (result.fetchedRuns === 0) {
    return buildZeroImportGuidance();
  }

  if (!result.syncResult) {
    return '기기에서 읽은 기록을 가져오기 대기열에 올려둔 상태야. 이어서 동기화가 돌아야 실제 기록으로 보이게 돼.';
  }

  if (result.syncResult.importedRuns === 0 && result.syncResult.duplicateRuns > 0) {
    return '이번 기록은 이미 들어와 있어서 중복 방지 규칙에 따라 건너뛴 상태야.';
  }

  if (result.syncResult.importedRuns > 0) {
    return '기기에서 읽은 기록이 실제 러닝 기록으로 정상 반영됐어.';
  }

  return '기록을 확인했지만 아직 반영할 새 변화는 없었어.';
}
