export type MarketFormState = {
  title: string;
  category: string;
  description: string;
  costPoints: string;
  partnerName: string;
  repeatable: boolean;
  isActive: boolean;
  inventoryCount: string;
};

export type NoticeFormState = {
  title: string;
  message: string;
  priority: string;
  isActive: boolean;
};

// Context the useAdminDashboard composer hands to each admin domain hook
// (notices/market/redemptions/races/users): the shared auth token plus the
// composer-owned submission wrapper, overview refresher, and message setter.
export type AdminDashboardDomainContext = {
  adminToken: string;
  withSubmission: (task: () => Promise<void>) => Promise<void>;
  refreshOverview: (token: string) => Promise<void>;
  setMessage: (message: string | null) => void;
};

export type RaceFormState = {
  title: string;
  subtitle: string;
  distanceKm: string;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: string;
  hostLabel: string;
  capacity: string;
  entryFeePoints: string;
  operationNote: string;
};
