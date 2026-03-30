import { ConnectedSource, RunSourceType } from '@/domain/types';

export interface HealthIntegrationProvider {
  sourceType: RunSourceType;
  isSupported(): Promise<boolean>;
  getConnectionStatus(): Promise<ConnectedSource>;
}

export class AppleHealthProvider implements HealthIntegrationProvider {
  sourceType: RunSourceType = 'apple_health';

  async isSupported() {
    return true;
  }

  async getConnectionStatus(): Promise<ConnectedSource> {
    return {
      sourceType: 'apple_health',
      displayName: 'Apple Health',
      connected: true,
      connectionStatus: 'connected',
    };
  }
}

export class HealthConnectProvider implements HealthIntegrationProvider {
  sourceType: RunSourceType = 'health_connect';

  async isSupported() {
    return true;
  }

  async getConnectionStatus(): Promise<ConnectedSource> {
    return {
      sourceType: 'health_connect',
      displayName: 'Health Connect',
      connected: false,
      connectionStatus: 'planned',
    };
  }
}
