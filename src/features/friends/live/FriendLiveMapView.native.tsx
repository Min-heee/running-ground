// 친구 라이브 지도 — iOS: 애플 지도(react-native-maps, API 키 불필요) 위에 친구 마커.
// Android는 Google Maps 키가 아직 없어 .android.tsx(지도 없는 상태 카드)가 대신 쓰인다
// (경찰과 도둑 지도와 같은 정책 — 키가 생기면 이 파일을 공용으로 승격).

import { StyleSheet, Text, View } from 'react-native';
import NativeMapView, { Marker as NativeMarker } from 'react-native-maps';
import { fixedColors, fontWeights } from '@/theme/tokens';

type FriendLiveMapViewProps = {
  latitude: number;
  longitude: number;
  friendName: string;
  // 마지막 위치 수신 후 경과(초) — 오래됐으면 마커를 흐리게.
  ageSeconds: number;
};

export function FriendLiveMapView({ latitude, longitude, friendName, ageSeconds }: FriendLiveMapViewProps) {
  return (
    <NativeMapView
      style={styles.map}
      region={{
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }}
      showsUserLocation={false}
      toolbarEnabled={false}
    >
      <NativeMarker
        coordinate={{ latitude, longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
      >
        <View style={[styles.marker, ageSeconds > 60 ? styles.markerStale : undefined]}>
          <View style={styles.dot} />
          <Text style={styles.name} numberOfLines={1}>{friendName}</Text>
        </View>
      </NativeMarker>
    </NativeMapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  marker: {
    alignItems: 'center',
    gap: 2,
  },
  markerStale: {
    opacity: 0.5,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: fixedColors.white,
    backgroundColor: fixedColors.brand,
  },
  name: {
    maxWidth: 90,
    fontSize: 11,
    fontWeight: fontWeights.extraBold,
    color: '#1F2937',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
