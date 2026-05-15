import { usePauseTrackingAction } from '@/features/runs/tracking/actions/usePauseTrackingAction';
import { useResumeTrackingAction } from '@/features/runs/tracking/actions/useResumeTrackingAction';
import type { PauseResumeTrackingActionsInput } from './types';

export function usePauseResumeTrackingActions(input: PauseResumeTrackingActionsInput) {
  return {
    handlePauseTracking: usePauseTrackingAction(input),
    handleResumeTracking: useResumeTrackingAction(input),
  };
}
