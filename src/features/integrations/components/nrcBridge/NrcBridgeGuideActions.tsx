import type { ReactNode } from 'react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { NrcBridgeGuideActionProps } from './types';

export function NrcBridgeGuideActions(props: NrcBridgeGuideActionProps) {
  return <>{buildActionButtons(props)}</>;
}

function buildActionButtons(input: NrcBridgeGuideActionProps) {
  const buttons: ReactNode[] = [];
  const {
    sectionId,
    platform,
    actionSourceType,
    importing = false,
    syncing = false,
    appleHealthConnected,
    appleHealthReady,
    healthConnectConnected,
    healthConnectReady,
    nrcConnected,
    stravaConnected,
    garminConnected,
    onConnectSource,
    onImportDevice,
    onSync,
  } = input;

  if (sectionId === 'nrc') {
    if (!nrcConnected && onConnectSource) {
      buttons.push(
        <SecondaryButton
          key="connect-nrc"
          label={actionSourceType === 'nrc' ? 'Nike Run Club 연결 중...' : 'Nike Run Club 표시하기'}
          onPress={() => onConnectSource('nrc')}
        />,
      );
    }

    appendBridgeActions(buttons, {
      actionSourceType,
      appleHealthConnected,
      appleHealthReady,
      healthConnectConnected,
      healthConnectReady,
      importing,
      onConnectSource,
      onImportDevice,
      platform,
    });

    if ((appleHealthConnected || healthConnectConnected) && onSync) {
      buttons.push(
        <SecondaryButton
          key="sync-nrc"
          label={syncing ? '동기화 중...' : '동기화 다시 하기'}
          onPress={onSync}
        />,
      );
    }

    return buttons;
  }

  if (sectionId === 'strava') {
    if (!stravaConnected && onConnectSource) {
      buttons.push(
        <PrimaryButton
          key="connect-strava"
          label={actionSourceType === 'strava' ? 'Strava 연결 중...' : 'Strava 연결하기'}
          onPress={() => onConnectSource('strava')}
        />,
      );
    }

    if (stravaConnected && onSync) {
      buttons.push(
        <SecondaryButton
          key="sync-strava"
          label={syncing ? '동기화 중...' : '동기화 다시 하기'}
          onPress={onSync}
        />,
      );
    }

    return buttons;
  }

  if (!garminConnected && onConnectSource) {
    buttons.push(
      <PrimaryButton
        key="connect-garmin"
        label={actionSourceType === 'garmin' ? 'Garmin 연결 중...' : 'Garmin 연결하기'}
        onPress={() => onConnectSource('garmin')}
      />,
    );
  }

  if (garminConnected && onSync) {
    buttons.push(
      <SecondaryButton
        key="sync-garmin"
        label={syncing ? '동기화 중...' : '동기화 다시 하기'}
        onPress={onSync}
      />,
    );
  }

  return buttons;
}

function appendBridgeActions(
  buttons: ReactNode[],
  input: Pick<
    NrcBridgeGuideActionProps,
    | 'actionSourceType'
    | 'appleHealthConnected'
    | 'appleHealthReady'
    | 'healthConnectConnected'
    | 'healthConnectReady'
    | 'importing'
    | 'onConnectSource'
    | 'onImportDevice'
    | 'platform'
  >,
) {
  const {
    actionSourceType,
    appleHealthConnected,
    appleHealthReady,
    healthConnectConnected,
    healthConnectReady,
    importing = false,
    onConnectSource,
    onImportDevice,
    platform,
  } = input;

  if (platform === 'ios') {
    if (!appleHealthConnected && onConnectSource) {
      buttons.push(
        <PrimaryButton
          key="connect-apple-health"
          label={actionSourceType === 'apple_health' ? 'Apple Health 연결 중...' : 'Apple Health 연결하기'}
          onPress={() => onConnectSource('apple_health')}
        />,
      );
    }

    if (appleHealthReady && onImportDevice) {
      buttons.push(
        <PrimaryButton
          key="import-ios"
          label={importing ? '기기 기록 가져오는 중...' : '기기 기록 가져오기'}
          onPress={onImportDevice}
        />,
      );
    }

    return;
  }

  if (!healthConnectConnected && onConnectSource) {
    buttons.push(
      <PrimaryButton
        key="connect-health-connect"
        label={actionSourceType === 'health_connect' ? 'Health Connect 연결 중...' : 'Health Connect 연결하기'}
        onPress={() => onConnectSource('health_connect')}
      />,
    );
  }

  if (healthConnectReady && onImportDevice) {
    buttons.push(
      <PrimaryButton
        key="import-android"
        label={importing ? '기기 기록 가져오는 중...' : '기기 기록 가져오기'}
        onPress={onImportDevice}
      />,
    );
  }
}
