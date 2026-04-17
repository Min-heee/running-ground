import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  importing?: boolean;
  nativeHealthReady?: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onImportDevice?: () => void;
  onSync?: () => void;
};

type GuideStep = {
  title: string;
  description: string;
};

type GuideSection = {
  id: 'nrc' | 'garmin';
  kicker: string;
  title: string;
  badge: string;
  statusLabel: string;
  statusValue: string;
  steps: GuideStep[];
};

export function NrcBridgeGuideCard({
  sources,
  platform = getCurrentDevicePlatform(),
  actionSourceType,
  syncing = false,
  importing = false,
  nativeHealthReady = false,
  onConnectSource,
  onImportDevice,
  onSync,
}: NrcBridgeGuideCardProps) {
  const [openSectionId, setOpenSectionId] = useState<'nrc' | 'garmin' | null>('nrc');
  const nrcSource = getSourceByType(sources, 'nrc');
  const appleHealthSource = getSourceByType(sources, 'apple_health');
  const stravaSource = getSourceByType(sources, 'strava');
  const garminSource = getSourceByType(sources, 'garmin');

  if (platform === 'ios') {
    const nrcSteps: GuideStep[] = [
      {
        title: '한 번만 Apple Health 공유 켜두기',
        description: '아이폰 설정 -> 개인정보 보호 및 보안 -> 건강 -> Nike Run Club로 들어가서 운동, 걷기/달리기 거리, 심박수 같은 공유를 켜주세요.',
      },
      {
        title: '오늘 러닝은 NRC로 기록하기',
        description: '러닝하실 때는 NRC에서 평소처럼 기록해 주세요. 우리 앱은 그 기록을 Apple Health를 통해 가져옵니다.',
      },
      {
        title: '러닝 후 Apple 건강 앱 확인하기',
        description: '러닝이 끝난 뒤 Apple 건강 앱 운동 탭에 방금 뛴 기록이 들어왔는지 먼저 확인해 주세요.',
      },
      {
        title: '우리 앱에서 기록 가져오기 또는 동기화',
        description: '그다음 우리 앱에서 기록 가져오기를 누르시고, 바로 안 보이면 동기화 다시 하기를 눌러 주세요.',
      },
    ];

    const appleHealthReady = Boolean(appleHealthSource?.connected) && nativeHealthReady;
    const garminSteps: GuideStep[] = [
      {
        title: 'Garmin Connect 준비하기',
        description: '먼저 Garmin Connect 앱에서 계정 로그인과 기기 동기화가 정상인지 확인해 주세요.',
      },
      {
        title: '우리 앱에서 Garmin 연결하기',
        description: '연동 관리에서 Garmin을 연결해 두시면 Garmin 기록을 우리 앱으로 가져올 준비가 됩니다.',
      },
      {
        title: '러닝 후 Garmin Connect 동기화 확인하기',
        description: '워치 러닝이 Garmin Connect에 올라온 뒤 우리 앱으로 오기 때문에, Garmin Connect 반영 여부를 먼저 확인해 주세요.',
      },
      {
        title: '우리 앱에서 동기화 다시 하기',
        description: '기록이 바로 안 보이면 우리 앱에서 동기화 다시 하기를 눌러 최신 기록을 불러와 주세요.',
      },
    ];

    const sections: GuideSection[] = [
      {
        id: 'nrc',
        kicker: 'Nike Run Club 가이드',
        title: 'NRC를 Apple Health 경유로 가져오는 방법',
        badge: 'iPhone',
        statusLabel: '준비 상태',
        statusValue: appleHealthReady ? '가져오기 가능' : '설정 필요',
        steps: nrcSteps,
      },
      {
        id: 'garmin',
        kicker: 'Garmin 가이드',
        title: 'Garmin 기록을 안정적으로 반영하는 방법',
        badge: '워치 연동',
        statusLabel: '연결 상태',
        statusValue: garminSource?.connected ? '연결됨' : '연결 전',
        steps: garminSteps,
      },
    ];

    return (
      <View style={styles.group}>
        {sections.map((section) => {
          const expanded = openSectionId === section.id;

          return (
            <Card key={section.id} style={styles.card}>
              <Pressable
                style={styles.accordionHeader}
                onPress={() => setOpenSectionId((current) => (current === section.id ? null : section.id))}
              >
                <View style={styles.copy}>
                  <Text style={styles.kicker}>{section.kicker}</Text>
                  <Text style={styles.title}>{section.title}</Text>
                </View>
                <View style={styles.accordionMeta}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{section.badge}</Text>
                  </View>
                  <Text style={styles.toggleText}>{expanded ? '접기' : '열기'}</Text>
                </View>
              </Pressable>

              {expanded ? (
                <>
                  <View style={styles.statusRow}>
                    <View style={styles.statusChip}>
                      <Text style={styles.statusLabel}>{section.statusLabel}</Text>
                      <Text style={styles.statusValue}>{section.statusValue}</Text>
                    </View>
                    {section.id === 'nrc' ? (
                      <View style={styles.statusChip}>
                        <Text style={styles.statusLabel}>Apple Health</Text>
                        <Text style={styles.statusValue}>{appleHealthSource?.connected ? '연결됨' : '연결 전'}</Text>
                      </View>
                    ) : (
                      <View style={styles.statusChip}>
                        <Text style={styles.statusLabel}>Garmin</Text>
                        <Text style={styles.statusValue}>{garminSource?.connected ? '연결됨' : '연결 전'}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.steps}>
                    {section.steps.map((step, index) => (
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

                  {section.id === 'nrc' ? (
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
                      {appleHealthReady && onImportDevice ? (
                        <PrimaryButton
                          label={importing ? 'NRC 러닝 가져오는 중...' : 'NRC 러닝 가져오기'}
                          onPress={onImportDevice}
                        />
                      ) : null}
                      {appleHealthSource?.connected && onSync ? (
                        <SecondaryButton label={syncing ? '동기화 중...' : '동기화 다시 하기'} onPress={onSync} />
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      {!garminSource?.connected && onConnectSource ? (
                        <PrimaryButton
                          label={actionSourceType === 'garmin' ? 'Garmin 연결 중...' : 'Garmin 연결하기'}
                          onPress={() => onConnectSource('garmin')}
                        />
                      ) : null}
                      {garminSource?.connected && onSync ? (
                        <SecondaryButton label={syncing ? '동기화 중...' : '동기화 다시 하기'} onPress={onSync} />
                      ) : null}
                    </View>
                  )}
                </>
              ) : null}
            </Card>
          );
        })}
      </View>
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
  group: {
    gap: 12,
  },
  card: {
    gap: 14,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  accordionMeta: {
    alignItems: 'flex-end',
    gap: 8,
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
  toggleText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
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
