import { Unmatched } from 'expo-router';
import AdminScreen from '@/features/settings/screens/AdminScreen';
import { isAdminRouteEnabled } from '@/utils/rgEnvTrace';

// In production the admin deep link behaves as a non-existent route (store-review surface
// reduction). Development/preview variants keep the full dashboard.
export default function AdminRoute() {
  if (!isAdminRouteEnabled()) {
    return <Unmatched />;
  }

  return <AdminScreen />;
}
