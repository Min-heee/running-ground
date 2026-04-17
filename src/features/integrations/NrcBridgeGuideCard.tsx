import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ConnectedSource, RunSourceType } from '@/domain/types';
import {
  DevicePlatform,
  getCurrentDevicePlatform,
  getSourceByType,
} from './sourceCatalog';

type NrcBridgeGuideCardProps = {
  sources: ConnectedSource[];
  platform?: DevicePlatform;
  actionSourceType?: string | null;
  syncing?: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onSync?: () => void;
};

type GuideStep = {
  title: string;
  description: string;
};

export function NrcBridgeGuideCard({
  sources,
  platform = getCurrentDevicePlatform(),
  actionSourceType,
  syncing = false,
  onConnectSource,
  onSync,
}: NrcBridgeGuideCardProps) {
  const nrcSource = getSourceByType(sources, 'nrc');
  const appleHealthSource = getSourceByType(sources, 'apple_health');
  const stravaSource = getSourceByType(sources, 'strava');
  const garminSource = getSourceByType(sources, 'garmin');

  if (platform === 'ios') {
    const steps: GuideStep[] = [
      {
        title: 'NRC에서 Apple Health 공유 허용',
        description: 'iPhone 설정의 Privacy & Security > Health > Nike Run Club에서 공유를 허용해야 해.',
      },
      {
        title: '우리 앱에서 Apple Health 연결',
        description: '우리 앱은 Apple Health를 읽어오므로, Apple Health 연결이 실제 반영 경로야.',
      },
      {
        title: 'TestFlight 빌드에서 기록 가져오기',
        description: '그다음 기기 기록 가져오기를 실행하면 NRC에서 넘어온 러닝 기록을 같이 읽을 수 있어.',
      },
    ];

    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>Nike Run Club 가이드</Text>
            <Text style={styles.title}>iPhone에서는 NRC를 Apple Health 경유로 붙이는 게 가장 안정적이야.</Text>
            <Text style={styles.description}>
              Nike 공식 도움말 기준으로 NRC는 Apple Health와 연결해 데이터를 보낼 수 있어. 우리 앱에서는 그 데이터를 Apple Health에서 읽어오는 흐름이 가장 현실적이야.
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>iPhone 경로</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusChip}>
            <Text style={styles.statusLabel}>Nike Run Club</Text>
            <Text style={styles.statusValue}>{nrcSource?.connected ? '표시됨' : '연결 전'}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusLabel}>Apple Health</Text>
            <Text style={styles.statusValue}>{appleHealthSource?.connected ? '연결됨' : '연결 전'}</Text>
          </View>
        </View>

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepMarker}>
                <Text style={styles.stepMarkerText}>{index + 1}</Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {!nrcSource?.connected && onConnectSource ? (
            <SecondaryButton
              label={actionSourceType === 'nrc' ? 'Nike Run Club 연결 중...' : 'Nike Run Club 표시하기'}
              onPress={() => onConnectSource('nrc')}
            />
          ) : null}
          {!appleHealthSource?.connected && onConnectSource ? (
            <PrimaryButton
              label={actionSourceType === 'apple_health' ? 'Apple Health 연결 중...' : 'Apple Health 연결하기'}
              onPress={() => onConnectSource('apple_health')}
            />
          ) : null}
          {appleHealthSource?.connected && onSync ? (
            <SecondaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={onSync} />
          ) : null}
        </View>
      </Card>
    );
  }

  if (platform === 'android') {
    const steps: GuideStep[] = [
      {
        title: 'NRC 앱에서 Partners 열기',
        description: 'Nike 공식 도움말 기준으로 Android에서는 NRC 앱의 Settings > Partners에서 연결 가능한 파트너를 확인하는 흐름이야.',
      },
      {
        title: 'Strava 또는 워치 파트너 연결',
        description: '지역과 계정에 따라 보이는 파트너가 다를 수 있지만, Strava나 Garmin/COROS 같은 웨어러블 경로가 현실적이야.',
      },
      {
        title: '우리 앱에서 같은 소스 연결 후 동기화',
        description: '우리 앱에서는 NRC 직접 수집보다 Strava나 Garmin을 같은 브리지 소스로 받아오는 편이 MVP 기준으로 안전해.',
      },
    ];

    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>Nike Run Club 가이드</Text>
            <Text style={styles.title}>Android에서는 NRC를 파트너 앱이나 워치 경유로 붙이는 편이 현실적이야.</Text>
            <Text style={styles.description}>
              공식적으로 확인되는 NRC 연결 경로는 파트너 앱과 기기 쪽이야. 그래서 우리 앱에서는 Strava나 Garmin 같은 같은 브리지 소스를 통해 받는 방향이 더 안정적이야.
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Android 경로</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusChip}>
            <Text style={styles.statusLabel}>Nike Run Club</Text>
            <Text style={styles.statusValue}>{nrcSource?.connected ? '표시됨' : '연결 전'}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusLabel}>Strava</Text>
            <Text style={styles.statusValue}>{stravaSource?.connected ? '연결됨' : '연결 전'}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusLabel}>Garmin</Text>
            <Text style={styles.statusValue}>{garminSource?.connected ? '연결됨' : '연결 전'}</Text>
          </View>
        </View>

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepMarker}>
                <Text style={styles.stepMarkerText}>{index + 1}</Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {!nrcSource?.connected && onConnectSource ? (
            <SecondaryButton
              label={actionSourceType === 'nrc' ? 'Nike Run Club 연결 중...' : 'Nike Run Club 표시하기'}
              onPress={() => onConnectSource('nrc')}
            />
          ) : null}
          {!stravaSource?.connected && onConnectSource ? (
            <PrimaryButton
              label={actionSourceType === 'strava' ? 'Strava 연결 중...' : 'Strava 연결하기'}
              onPress={() => onConnectSource('strava')}
            />
          ) : null}
          {onSync ? <SecondaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={onSync} /> : null}
        </View>

        <Text style={styles.footnote}>
          Nike 도움말 기준으로 연결 가능한 파트너는 지역에 따라 달라질 수 있어. 앱 안의 Partners 목록이 최종 기준이야.
        </Text>
      </Card>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: '#101828',
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 28,
  },
  description: {
    color: '#475467',
    lineHeight: 21,
  },
  badge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  statusLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  statusValue: {
    color: '#111827',
    fontWeight: '800',
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMarkerText: {
    color: '#344054',
    fontWeight: '800',
    fontSize: 12,
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: '#111827',
    fontWeight: '700',
  },
  stepDescription: {
    color: '#667085',
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  footnote: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
});
