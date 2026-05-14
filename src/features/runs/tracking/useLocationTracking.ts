import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import {
  buildLiveShareFallbackLabel,
  buildLiveShareLabelFromAddress,
} from '@/features/runs/tracking/trackingSession';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type UseLocationTrackingInput = {
  setLocationPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setBackgroundLocationPermissionGranted: Dispatch<SetStateAction<boolean | null>>;
  setLiveShareLabel: Dispatch<SetStateAction<string | null>>;
};

export function useLocationTracking({
  setLocationPermissionGranted,
  setBackgroundLocationPermissionGranted,
  setLiveShareLabel,
}: UseLocationTrackingInput) {
  const ensureLocationPermission = useCallback(async () => {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();
    const granted = foregroundPermission.granted || foregroundPermission.status === 'granted';
    setLocationPermissionGranted(granted);

    if (!granted) {
      throw new Error('위치 권한을 허용해야 지도와 거리 측정이 가능해.');
    }
  }, [setLocationPermissionGranted]);

  const ensureBackgroundLocationPermission = useCallback(async (options?: { required?: boolean }) => {
    const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();
    let granted = currentBackgroundPermission.granted || currentBackgroundPermission.status === 'granted';

    if (!granted && options?.required) {
      const requestedBackgroundPermission = await Location.requestBackgroundPermissionsAsync();
      granted = requestedBackgroundPermission.granted || requestedBackgroundPermission.status === 'granted';
    }

    setBackgroundLocationPermissionGranted(granted);

    if (!granted && options?.required) {
      throw new Error(
        Platform.OS === 'ios'
          ? '백그라운드에서도 계속 측정하려면 설정 > RunningGround > 위치에서 `항상 허용`을 켜주세요.'
          : '백그라운드에서도 계속 측정하려면 RunningGround 위치 권한을 `항상 허용`으로 바꿔주세요.',
      );
    }

    return granted;
  }, [setBackgroundLocationPermissionGranted]);

  const resolveLiveShareLabel = useCallback(async (coordinate?: Coordinate) => {
    if (!coordinate) {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }

    try {
      const [address] = await Location.reverseGeocodeAsync(coordinate);
      const nextLabel = buildLiveShareLabelFromAddress(address) || buildLiveShareFallbackLabel();
      setLiveShareLabel(nextLabel);
      return nextLabel;
    } catch {
      const fallbackLabel = buildLiveShareFallbackLabel();
      setLiveShareLabel(fallbackLabel);
      return fallbackLabel;
    }
  }, [setLiveShareLabel]);

  return {
    ensureBackgroundLocationPermission,
    ensureLocationPermission,
    resolveLiveShareLabel,
  };
}
