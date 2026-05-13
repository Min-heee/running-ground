import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useConfigureNotificationHandler() {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      return;
    }

    void import('expo-notifications')
      .then((Notifications) => {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      })
      .catch(() => {
        // Older binaries may not have the native notification module yet.
      });
  }, []);
}
