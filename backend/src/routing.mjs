import { KAKAO_MOBILITY_REST_API_KEY, TMAP_APP_KEY } from './config.mjs';

const KAKAO_WAYPOINTS_DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/waypoints/directions';
const TMAP_PEDESTRIAN_DIRECTIONS_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const TMAP_PREVIEW_POINT_LIMIT = 10;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceBetweenPoints(start, end) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function calculateRouteDistanceKm(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  let totalDistanceMeters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    totalDistanceMeters += calculateDistanceBetweenPoints(coordinates[index - 1], coordinates[index]);
  }

  return Number((totalDistanceMeters / 1000).toFixed(2));
}

function dedupeCoordinates(coordinates) {
  return coordinates.filter((coordinate, index) => {
    if (index === 0) {
      return true;
    }

    const previousCoordinate = coordinates[index - 1];
    return calculateDistanceBetweenPoints(previousCoordinate, coordinate) > 3;
  });
}

function sampleWaypoints(coordinates, maximumCount) {
  if (coordinates.length <= maximumCount) {
    return coordinates;
  }

  const sampled = [];
  const lastIndex = coordinates.length - 1;

  for (let index = 0; index < maximumCount; index += 1) {
    const sourceIndex = Math.round((index / (maximumCount - 1)) * lastIndex);
    sampled.push(coordinates[sourceIndex]);
  }

  return sampled;
}

function formatKakaoPoint(point, fallbackName) {
  return {
    name: fallbackName,
    x: point.longitude,
    y: point.latitude,
  };
}

function normalizeCoordinatePair(longitude, latitude) {
  const normalizedLongitude = Number(longitude);
  const normalizedLatitude = Number(latitude);

  if (!Number.isFinite(normalizedLongitude) || !Number.isFinite(normalizedLatitude)) {
    return null;
  }

  return {
    longitude: normalizedLongitude,
    latitude: normalizedLatitude,
  };
}

function extractCoordinatesFromGeometry(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === 'LineString') {
    return geometry.coordinates
      .map((coordinate) => Array.isArray(coordinate) ? normalizeCoordinatePair(coordinate[0], coordinate[1]) : null)
      .filter(Boolean);
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.flatMap((line) => (
      Array.isArray(line)
        ? line
          .map((coordinate) => Array.isArray(coordinate) ? normalizeCoordinatePair(coordinate[0], coordinate[1]) : null)
          .filter(Boolean)
        : []
    ));
  }

  return [];
}

function parseTmapPedestrianRoute(payload) {
  const features = Array.isArray(payload?.features)
    ? payload.features
    : Array.isArray(payload?.route?.features)
      ? payload.route.features
      : [];

  const coordinates = [];

  for (const feature of features) {
    const geometryCoordinates = extractCoordinatesFromGeometry(feature?.geometry);
    coordinates.push(...geometryCoordinates);
  }

  return dedupeCoordinates(coordinates);
}

async function requestKakaoMobilityRoute(points) {
  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1);

  const response = await fetch(KAKAO_WAYPOINTS_DIRECTIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `KakaoAK ${KAKAO_MOBILITY_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin: formatKakaoPoint(origin, 'start'),
      destination: formatKakaoPoint(destination, 'finish'),
      waypoints: waypoints.map((point, index) => formatKakaoPoint(point, `waypoint-${index + 1}`)),
      priority: 'RECOMMEND',
      alternatives: false,
      road_details: false,
      summary: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Kakao Mobility routing failed with ${response.status}`);
  }

  const payload = await response.json();
  const primaryRoute = Array.isArray(payload?.routes) ? payload.routes[0] : null;

  if (!primaryRoute || !Array.isArray(primaryRoute.sections)) {
    throw new Error('Kakao Mobility response shape was not recognized.');
  }

  const coordinates = [];

  for (const section of primaryRoute.sections) {
    for (const road of section.roads ?? []) {
      const vertexes = Array.isArray(road.vertexes) ? road.vertexes : [];

      for (let index = 0; index < vertexes.length; index += 2) {
        const normalizedCoordinate = normalizeCoordinatePair(vertexes[index], vertexes[index + 1]);

        if (normalizedCoordinate) {
          coordinates.push(normalizedCoordinate);
        }
      }
    }
  }

  return dedupeCoordinates(coordinates);
}

async function requestTmapPedestrianSegment(start, end, segmentIndex, segmentCount) {
  const response = await fetch(TMAP_PEDESTRIAN_DIRECTIONS_URL, {
    method: 'POST',
    headers: {
      appKey: TMAP_APP_KEY,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      startX: start.longitude,
      startY: start.latitude,
      endX: end.longitude,
      endY: end.latitude,
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: segmentIndex === 0 ? '출발' : `경유 ${segmentIndex}`,
      endName: segmentIndex === segmentCount - 1 ? '도착' : `경유 ${segmentIndex + 1}`,
      searchOption: '0',
      sort: 'index',
    }),
  });

  if (!response.ok) {
    throw new Error(`TMAP pedestrian routing failed with ${response.status}`);
  }

  const payload = await response.json();
  const coordinates = parseTmapPedestrianRoute(payload);

  if (coordinates.length < 2) {
    throw new Error('TMAP pedestrian routing returned an empty path.');
  }

  return coordinates;
}

async function requestTmapPedestrianRoute(points) {
  const coordinates = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const directDistanceMeters = calculateDistanceBetweenPoints(start, end);

    if (directDistanceMeters < 8) {
      if (coordinates.length === 0) {
        coordinates.push(start);
      }

      coordinates.push(end);
      continue;
    }

    const segmentCoordinates = await requestTmapPedestrianSegment(start, end, index - 1, points.length - 1);

    if (coordinates.length === 0) {
      coordinates.push(...segmentCoordinates);
      continue;
    }

    coordinates.push(...segmentCoordinates.slice(1));
  }

  return dedupeCoordinates(coordinates);
}

function buildRoadFollowedPreview({
  displayTitle,
  description,
  startLabel,
  keyword,
  desiredDistanceKm,
  coordinates,
  provider,
}) {
  return {
    displayTitle,
    description,
    startLabel,
    requestedKeyword: keyword,
    requestedDistanceKm: Number(desiredDistanceKm.toFixed(1)),
    estimatedDistanceKm: calculateRouteDistanceKm(coordinates),
    coordinates,
    provider,
    roadFollowed: true,
  };
}

export function buildRoutePreviewFallback({
  keyword,
  desiredDistanceKm,
  displayTitle,
  description,
  startLabel,
  roughCoordinates,
  warning,
}) {
  const coordinates = dedupeCoordinates(roughCoordinates);

  return {
    displayTitle,
    description,
    startLabel,
    requestedKeyword: keyword,
    requestedDistanceKm: Number(desiredDistanceKm.toFixed(1)),
    estimatedDistanceKm: calculateRouteDistanceKm(coordinates),
    coordinates,
    provider: 'template',
    roadFollowed: false,
    ...(warning ? { warning } : {}),
  };
}

async function buildTmapPedestrianPreview({
  keyword,
  desiredDistanceKm,
  displayTitle,
  description,
  startLabel,
  normalizedCoordinates,
}) {
  const loopDistanceMeters = normalizedCoordinates.length > 2
    ? calculateDistanceBetweenPoints(normalizedCoordinates[0], normalizedCoordinates[normalizedCoordinates.length - 1])
    : Number.POSITIVE_INFINITY;
  const closesLoop = loopDistanceMeters < 25;
  const workingCoordinates = closesLoop ? normalizedCoordinates.slice(0, -1) : normalizedCoordinates;
  const sampledCoordinates = sampleWaypoints(workingCoordinates, TMAP_PREVIEW_POINT_LIMIT);
  const routeRequestCoordinates = closesLoop
    ? [...sampledCoordinates, sampledCoordinates[0]]
    : sampledCoordinates;

  if (!TMAP_APP_KEY) {
    throw new Error('TMAP pedestrian routing is not configured.');
  }

  if (routeRequestCoordinates.length < 2) {
    throw new Error('Not enough coordinates to build a TMAP pedestrian route.');
  }

  const tmapRoute = await requestTmapPedestrianRoute(routeRequestCoordinates);
  return buildRoadFollowedPreview({
    keyword,
    desiredDistanceKm,
    displayTitle,
    description,
    startLabel,
    coordinates: tmapRoute,
    provider: 'tmap_pedestrian',
  });
}

async function buildKakaoMobilityPreview({
  keyword,
  desiredDistanceKm,
  displayTitle,
  description,
  startLabel,
  normalizedCoordinates,
}) {
  const loopDistanceMeters = normalizedCoordinates.length > 2
    ? calculateDistanceBetweenPoints(normalizedCoordinates[0], normalizedCoordinates[normalizedCoordinates.length - 1])
    : Number.POSITIVE_INFINITY;
  const closesLoop = loopDistanceMeters < 25;
  const workingCoordinates = closesLoop ? normalizedCoordinates.slice(0, -1) : normalizedCoordinates;
  const sampledCoordinates = sampleWaypoints(workingCoordinates, 32);

  if (!KAKAO_MOBILITY_REST_API_KEY) {
    throw new Error('Kakao Mobility routing is not configured.');
  }

  if (sampledCoordinates.length < 2) {
    throw new Error('Not enough coordinates to route.');
  }

  const forwardRoute = await requestKakaoMobilityRoute(sampledCoordinates);
  let combinedRoute = forwardRoute;

  if (closesLoop && sampledCoordinates.length >= 2) {
    const returnRoute = await requestKakaoMobilityRoute([
      sampledCoordinates[sampledCoordinates.length - 1],
      sampledCoordinates[0],
    ]);
    combinedRoute = dedupeCoordinates([...forwardRoute, ...returnRoute.slice(1)]);
  }

  return buildRoadFollowedPreview({
    keyword,
    desiredDistanceKm,
    displayTitle,
    description,
    startLabel,
    coordinates: combinedRoute,
    provider: 'kakao_mobility',
  });
}

export async function buildRoadAlignedRoutePreview({
  keyword,
  desiredDistanceKm,
  displayTitle,
  description,
  startLabel,
  roughCoordinates,
}) {
  const normalizedCoordinates = dedupeCoordinates(roughCoordinates);

  try {
    return await buildTmapPedestrianPreview({
      keyword,
      desiredDistanceKm,
      displayTitle,
      description,
      startLabel,
      normalizedCoordinates,
    });
  } catch (tmapError) {
    if (TMAP_APP_KEY) {
      console.warn('Failed to build TMAP pedestrian route preview:', tmapError);
    }
  }

  try {
    return await buildKakaoMobilityPreview({
      keyword,
      desiredDistanceKm,
      displayTitle,
      description,
      startLabel,
      normalizedCoordinates,
    });
  } catch (kakaoError) {
    if (KAKAO_MOBILITY_REST_API_KEY) {
      console.warn('Failed to build Kakao Mobility route preview:', kakaoError);
    }
  }

  const warning = TMAP_APP_KEY || KAKAO_MOBILITY_REST_API_KEY
    ? '도보 경로 추천선을 아직 만들지 못해서, 우선 그림 윤곽선을 먼저 보여드려요.'
    : 'TMAP 보행자 경로 설정이 아직 없어서, 우선 그림 윤곽선을 먼저 보여드려요.';

  return buildRoutePreviewFallback({
    keyword,
    desiredDistanceKm,
    displayTitle,
    description,
    startLabel,
    roughCoordinates: normalizedCoordinates,
    warning,
  });
}
