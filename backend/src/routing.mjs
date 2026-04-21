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

export async function buildRoadAlignedRoutePreview({
  keyword,
  desiredDistanceKm,
  displayTitle,
  description,
  startLabel,
  roughCoordinates,
}) {
  return buildRoutePreviewFallback({
    keyword,
    desiredDistanceKm,
    displayTitle,
    description,
    startLabel,
    roughCoordinates,
  });
}
