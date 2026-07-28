// Android 라이브 "레이더" — Google Maps API 키가 아직 바이너리에 없어(#207과 같은 제약)
// 지도 타일 대신 경기장 원을 그대로 그린 레이더에 참가자를 플로팅한다. 진짜 지도는
// 다음 네이티브 빌드(키 배선)에서 이 파일만 native 구현으로 바꾸면 된다.
// 레이더는 항상 "확대" 수준의 정보를 보여준다: 방향 화살표 + (인원이 적을 때) 이름/페이스.

import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { localOffsetMeters } from '@/features/runs/chase/chaseLiveGeo';
import type { ChaseLiveParticipant } from '@/lib/api/types';
import { fixedColors, fontWeights } from '@/theme/tokens';

const SELF_COLOR = fixedColors.brand;
const OTHER_COLOR = '#FF9F43';
const MAX_LABELED_PARTICIPANTS = 8;

type ChaseLiveMapViewProps = {
  latitude: number;
  longitude: number;
  radiusM: number;
  // 레이더는 추상화라 폴리곤을 그리지 않는다 — 스케일은 바운딩 반경(radiusM) 기준.
  polygon?: { latitude: number; longitude: number }[];
  participants: ChaseLiveParticipant[];
};

export function ChaseLiveMapView({ latitude, longitude, radiusM, participants }: ChaseLiveMapViewProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };
  const diameter = Math.min(size.width, size.height) - 16;
  const showLabels = participants.length <= MAX_LABELED_PARTICIPANTS;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {diameter > 40 ? (
        <View style={[styles.arenaCircle, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
          <View
            style={[
              styles.innerRing,
              {
                width: diameter / 2,
                height: diameter / 2,
                borderRadius: diameter / 4,
                left: diameter / 4,
                top: diameter / 4,
              },
            ]}
          />
          {participants.map((participant) => {
            const offset = localOffsetMeters({ latitude, longitude }, participant);
            // 반경 + 8% 여유 밖은 가장자리에 클램프 (경기장 살짝 이탈한 러너도 보이게).
            const scale = diameter / 2 / (radiusM * 1.08);
            const rawX = offset.x * scale;
            const rawY = offset.y * scale;
            const magnitude = Math.hypot(rawX, rawY);
            const limit = diameter / 2 - 10;
            const clampRatio = magnitude > limit ? limit / magnitude : 1;
            const left = diameter / 2 + rawX * clampRatio;
            const top = diameter / 2 - rawY * clampRatio;
            const color = participant.isSelf ? SELF_COLOR : OTHER_COLOR;
            const staleOpacity = participant.ageSeconds > 60 ? 0.45 : 1;

            return (
              <View
                key={participant.userId}
                style={[styles.participant, { left: left - 22, top: top - 10, opacity: staleOpacity }]}
              >
                {participant.headingDeg !== null ? (
                  <View style={{ transform: [{ rotate: `${participant.headingDeg}deg` }] }}>
                    <View style={[styles.arrow, { borderBottomColor: color }]} />
                  </View>
                ) : (
                  <View style={[styles.dot, { backgroundColor: color }]} />
                )}
                {showLabels && (participant.isSelf || participant.name || participant.paceLabel) ? (
                  <Text style={[styles.nameLabel, { color }]} numberOfLines={1}>
                    {participant.isSelf ? '나' : participant.name}
                    {participant.paceLabel ? ` ${participant.paceLabel}` : ''}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0E1E',
  },
  arenaCircle: {
    borderWidth: 2,
    borderColor: 'rgba(158, 138, 255, 0.65)',
    backgroundColor: 'rgba(109, 94, 247, 0.10)',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(158, 138, 255, 0.25)',
  },
  participant: {
    position: 'absolute',
    width: 44,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  nameLabel: {
    fontSize: 9,
    fontWeight: fontWeights.extraBold,
    maxWidth: 64,
  },
});
