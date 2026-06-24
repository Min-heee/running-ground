// Minutes-before-slot-start at which pre-start match reminders fire. Kept in its own
// RN-free module so it can be unit-tested without importing react-native (the rest of
// matchNotifications pulls in expo-notifications / Platform). S4b: 10/5/1 minutes.
export const MATCH_REMINDER_OFFSETS_MINUTES = [10, 5, 1] as const;
