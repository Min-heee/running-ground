import { Alert } from 'react-native';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { resolveUpcomingMatchCancelPrompt } from './upcomingMatchCancelPrompt';

// 파티런 예약이면 확인 Alert를 거친 뒤 run을 부르고, 공식 예약이면 바로 run을 부른다.
// 홈 카드와 러닝 탭 카드가 같은 진입점을 쓴다.
export function confirmUpcomingMatchCancel(
  match: UpcomingRunningMatchItem,
  run: (match: UpcomingRunningMatchItem) => void,
) {
  const prompt = resolveUpcomingMatchCancelPrompt(match);

  if (!prompt) {
    run(match);
    return;
  }

  Alert.alert(prompt.title, prompt.message, [
    { text: '돌아가기', style: 'cancel' },
    { text: prompt.confirmLabel, style: 'destructive', onPress: () => run(match) },
  ]);
}
