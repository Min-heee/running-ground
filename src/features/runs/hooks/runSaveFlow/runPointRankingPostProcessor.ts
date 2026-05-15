import { router } from 'expo-router';
import { buildRunDetailRedirect } from '@/features/runs/lifecycle/runSaveNavigation';

export function runPointRankingPostProcessor({
  isTabMode,
  runId,
}: {
  isTabMode: boolean;
  runId: string;
}) {
  router.replace(buildRunDetailRedirect({ runId, isTabMode }));
}
