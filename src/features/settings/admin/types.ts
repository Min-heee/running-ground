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
