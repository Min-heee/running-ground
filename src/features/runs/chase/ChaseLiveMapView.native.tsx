// iOS 라이브 지도 — 애플 지도(react-native-maps, API 키 불필요) 위에 경기장 원 + 참가자 마커.
// 줌인(뷰포트가 경기장 반경 수준)하면 방향 화살표 + 이름 + 페이스, 줌아웃하면 점만.
// Android는 Google Maps API 키가 없어 이 파일 대신 레이더 뷰(.android.tsx)가 쓰인다.

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NativeMapView, {
  Circle as NativeCircle,
  Marker as NativeMarker,
  Polygon as NativePolygon,
} from 'react-native-maps';
import { latitudeDeltaForRadius, metersPerLngDegree } from '@/features/runs/chase/chaseLiveGeo';
import type { ChaseLiveParticipant } from '@/lib/api/types';
import { fixedColors, fontWeights } from '@/theme/tokens';

const SELF_COLOR = fixedColors.brand;
const OTHER_COLOR = '#FF9F43';

type ChaseLiveMapViewProps = {
  latitude: number;
  longitude: number;
  radiusM: number;
  // 공원 실제 경계 — 있으면 원 대신 이 모양을 그린다 (지오펜스 판정도 서버에서 이 모양).
  polygon?: { latitude: number; longitude: number }[];
  participants: ChaseLiveParticipant[];
};

function ParticipantMarkerBody({
  participant,
  detailed,
}: {
  participant: ChaseLiveParticipant;
  detailed: boolean;
}) {
  const color = participant.isSelf ? SELF_COLOR : OTHER_COLOR;
  // 60초 넘게 소식 없는 러너(주머니 속 아이폰)는 흐리게 — 마지막으로 본 위치라는 뜻.
  const staleOpacity = participant.ageSeconds > 60 ? 0.45 : 1;

  if (!detailed) {
    return <View style={[styles.dot, { backgroundColor: color, opacity: staleOpacity }]} />;
  }

  return (
    <View style={[styles.detailedMarker, { opacity: staleOpacity }]}>
      {participant.headingDeg !== null ? (
        <View style={{ transform: [{ rotate: `${participant.headingDeg}deg` }] }}>
          <View style={[styles.arrow, { borderBottomColor: color }]} />
        </View>
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
      {participant.isSelf || participant.name ? (
        <Text style={[styles.nameLabel, { color }]} numberOfLines={1}>
          {participant.isSelf ? '나' : participant.name}
        </Text>
      ) : null}
      {participant.paceLabel ? <Text style={styles.paceLabel}>{participant.paceLabel}</Text> : null}
    </View>
  );
}

export function ChaseLiveMapView({ latitude, longitude, radiusM, polygon, participants }: ChaseLiveMapViewProps) {
  const initialLatitudeDelta = latitudeDeltaForRadius(radiusM);
  // 뷰포트 세로 스팬이 경기장 반경(≈지름의 절반) 수준까지 좁혀지면 "확대"로 본다.
  const detailedThresholdDelta = (radiusM * 1.4) / 111_320;
  const [detailed, setDetailed] = useState(initialLatitudeDelta <= detailedThresholdDelta);

  const initialRegion = useMemo(
    () => ({
      latitude,
      longitude,
      latitudeDelta: initialLatitudeDelta,
      longitudeDelta:
        (radiusM * 2 * 1.3) / metersPerLngDegree(latitude),
    }),
    [initialLatitudeDelta, latitude, longitude, radiusM],
  );

  return (
    <NativeMapView
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      onRegionChangeComplete={(region) => {
        setDetailed(region.latitudeDelta <= detailedThresholdDelta);
      }}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {polygon && polygon.length >= 3 ? (
        <NativePolygon
          coordinates={polygon}
          strokeColor="rgba(109, 94, 247, 0.55)"
          strokeWidth={2}
          fillColor="rgba(109, 94, 247, 0.08)"
        />
      ) : (
        <NativeCircle
          center={{ latitude, longitude }}
          radius={radiusM}
          strokeColor="rgba(109, 94, 247, 0.55)"
          strokeWidth={2}
          fillColor="rgba(109, 94, 247, 0.08)"
        />
      )}
      {participants.map((participant) => (
        <NativeMarker
          key={participant.userId}
          coordinate={{ latitude: participant.latitude, longitude: participant.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges
        >
          <ParticipantMarkerBody participant={participant} detailed={detailed} />
        </NativeMarker>
      ))}
    </NativeMapView>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  detailedMarker: {
    alignItems: 'center',
    maxWidth: 88,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  nameLabel: {
    fontSize: 11,
    fontWeight: fontWeights.extraBold,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  paceLabel: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    color: '#111827',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
});
