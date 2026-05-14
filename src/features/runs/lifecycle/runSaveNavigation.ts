import type { Href } from 'expo-router';

type BuildRunDetailRedirectInput = {
  runId: string;
  isTabMode: boolean;
};

export function buildRunDetailRedirect({ runId, isTabMode }: BuildRunDetailRedirectInput): Href {
  return {
    pathname: '/run-detail',
    params: {
      runId,
      origin: isTabMode ? 'running' : 'activity',
    },
  };
}
