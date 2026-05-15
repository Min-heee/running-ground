import type { UseTrackRunRuntimeMatchActionsInput } from '@/features/runs/runtime/trackRunRuntimeMatchActionTypes';
import { useTrackRunRuntimeMatchMaintenanceActions } from '@/features/runs/runtime/useTrackRunRuntimeMatchMaintenanceActions';
import { useTrackRunRuntimeMatchRequestActions } from '@/features/runs/runtime/useTrackRunRuntimeMatchRequestActions';

export function useTrackRunRuntimeMatchActions(input: UseTrackRunRuntimeMatchActionsInput) {
  const maintenanceActions = useTrackRunRuntimeMatchMaintenanceActions(input);
  const requestActions = useTrackRunRuntimeMatchRequestActions(input);

  return {
    ...maintenanceActions,
    ...requestActions,
  };
}
