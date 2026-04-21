import { calculateDistanceBetweenPoints, type MapCoordinate } from './tracking';

type NormalizedPoint = {
  x: number;
  y: number;
};

type RouteArtTemplate = {
  key: 'sweet-potato' | 'cat' | 'heart' | 'star' | 'signature';
  label: string;
  description: string;
  points: NormalizedPoint[];
};

export type SuggestedArtRoute = {
  id: string;
  templateKey: RouteArtTemplate['key'];
  displayTitle: string;
  description: string;
  startLabel: string;
  requestedKeyword: string;
  requestedDistanceKm: number;
  estimatedDistanceKm: number;
  coordinates: MapCoordinate[];
  provider: 'template';
  roadFollowed: boolean;
  warning?: string;
};

const MIN_DISTANCE_KM = 2;
const MAX_DISTANCE_KM = 20;

const ROUTE_ART_TEMPLATES: RouteArtTemplate[] = [
  {
    key: 'sweet-potato',
    label: '고구마 러닝',
    description: '볼록한 고구마 실루엣으로 한 바퀴를 크게 도는 추천 루트예요.',
    points: [
      { x: 0, y: 0 },
      { x: 0.7, y: -0.35 },
      { x: 1.15, y: -0.15 },
      { x: 1.45, y: 0.45 },
      { x: 1.2, y: 1.1 },
      { x: 0.45, y: 1.55 },
      { x: -0.35, y: 1.45 },
      { x: -1.05, y: 1.05 },
      { x: -1.35, y: 0.2 },
      { x: -0.9, y: -0.45 },
      { x: -0.25, y: -0.2 },
      { x: 0, y: 0 },
    ],
  },
  {
    key: 'cat',
    label: '고양이 러닝',
    description: '귀가 살아 있는 고양이 얼굴 느낌으로 크게 도는 추천 루트예요.',
    points: [
      { x: 0, y: 0 },
      { x: 0.85, y: -0.2 },
      { x: 1.2, y: 0.25 },
      { x: 1.55, y: 1.05 },
      { x: 1.05, y: 0.8 },
      { x: 0.6, y: 1.7 },
      { x: 0.1, y: 1.05 },
      { x: -0.1, y: 1.05 },
      { x: -0.6, y: 1.75 },
      { x: -1.05, y: 0.8 },
      { x: -1.55, y: 1.05 },
      { x: -1.2, y: 0.25 },
      { x: -0.85, y: -0.2 },
      { x: 0, y: 0 },
    ],
  },
  {
    key: 'heart',
    label: '하트 러닝',
    description: '하트 모양으로 감싸듯 뛰는 추천 루트예요.',
    points: [
      { x: 0, y: 0 },
      { x: 0.75, y: -0.55 },
      { x: 1.45, y: -0.15 },
      { x: 1.45, y: 0.8 },
      { x: 0.75, y: 1.35 },
      { x: 0, y: 1.85 },
      { x: -0.75, y: 1.35 },
      { x: -1.45, y: 0.8 },
      { x: -1.45, y: -0.15 },
      { x: -0.75, y: -0.55 },
      { x: 0, y: 0 },
    ],
  },
  {
    key: 'star',
    label: '별 러닝',
    description: '별처럼 리듬감 있게 꺾이며 도는 추천 루트예요.',
    points: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.8 },
      { x: 1.35, y: 0.95 },
      { x: 0.7, y: 1.55 },
      { x: 0.95, y: 2.45 },
      { x: 0, y: 1.95 },
      { x: -0.95, y: 2.45 },
      { x: -0.7, y: 1.55 },
      { x: -1.35, y: 0.95 },
      { x: -0.45, y: 0.8 },
      { x: 0, y: 0 },
    ],
  },
  {
    key: 'signature',
    label: '시그니처 러닝',
    description: '입력한 키워드 분위기로 부드럽게 흐르는 아트 루트를 추천해드려요.',
    points: [
      { x: 0, y: 0 },
      { x: 0.95, y: -0.15 },
      { x: 1.55, y: 0.45 },
      { x: 1.25, y: 1.25 },
      { x: 0.35, y: 1.65 },
      { x: -0.4, y: 1.35 },
      { x: -1.1, y: 0.8 },
      { x: -1.35, y: 0.1 },
      { x: -0.95, y: -0.45 },
      { x: -0.25, y: -0.65 },
      { x: 0.35, y: -0.35 },
      { x: 0, y: 0 },
    ],
  },
];

function hashString(value: string) {
  return Array.from(value).reduce((result, character) => ((result << 5) - result + character.charCodeAt(0)) | 0, 0);
}

function clampDistanceKm(value: number) {
  return Math.min(MAX_DISTANCE_KM, Math.max(MIN_DISTANCE_KM, Number.isFinite(value) ? value : 5));
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function pickTemplate(keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (normalizedKeyword.includes('고구마') || normalizedKeyword.includes('sweet potato') || normalizedKeyword.includes('감자')) {
    return ROUTE_ART_TEMPLATES.find((template) => template.key === 'sweet-potato')!;
  }

  if (normalizedKeyword.includes('고양이') || normalizedKeyword.includes('냥') || normalizedKeyword.includes('cat')) {
    return ROUTE_ART_TEMPLATES.find((template) => template.key === 'cat')!;
  }

  if (normalizedKeyword.includes('하트') || normalizedKeyword.includes('heart')) {
    return ROUTE_ART_TEMPLATES.find((template) => template.key === 'heart')!;
  }

  if (normalizedKeyword.includes('별') || normalizedKeyword.includes('star')) {
    return ROUTE_ART_TEMPLATES.find((template) => template.key === 'star')!;
  }

  const fallbacks = ROUTE_ART_TEMPLATES.filter((template) => template.key !== 'sweet-potato' && template.key !== 'cat');
  return fallbacks[Math.abs(hashString(normalizedKeyword || 'signature')) % fallbacks.length];
}

function rotatePoint(point: NormalizedPoint, angleRadians: number): NormalizedPoint {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function measureTemplateLength(points: NormalizedPoint[]) {
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    totalLength += Math.hypot(currentPoint.x - previousPoint.x, currentPoint.y - previousPoint.y);
  }

  return totalLength;
}

function toCoordinate(anchor: MapCoordinate, point: NormalizedPoint, metersPerUnit: number) {
  const offsetXMeters = point.x * metersPerUnit;
  const offsetYMeters = point.y * metersPerUnit;
  const latitudeDelta = offsetYMeters / 111320;
  const longitudeDelta = offsetXMeters / (111320 * Math.cos((anchor.latitude * Math.PI) / 180));

  return {
    latitude: Number((anchor.latitude + latitudeDelta).toFixed(6)),
    longitude: Number((anchor.longitude + longitudeDelta).toFixed(6)),
  };
}

function buildTitle(template: RouteArtTemplate, keyword: string) {
  const trimmedKeyword = keyword.trim();

  if (!trimmedKeyword || template.key !== 'signature') {
    return template.label;
  }

  return `${trimmedKeyword} 러닝`;
}

export function buildSuggestedArtRoute({
  keyword,
  desiredDistanceKm,
  startCoordinate,
  startLabel,
}: {
  keyword: string;
  desiredDistanceKm: number;
  startCoordinate: MapCoordinate;
  startLabel: string;
}): SuggestedArtRoute {
  const template = pickTemplate(keyword);
  const clampedDistanceKm = clampDistanceKm(desiredDistanceKm);
  const templateLength = measureTemplateLength(template.points);
  const metersPerUnit = (clampedDistanceKm * 1000) / templateLength;
  const rotation = ((Math.abs(hashString(`${keyword}:${startLabel}`)) % 18) - 9) * (Math.PI / 180);
  const rotatedPoints = template.points.map((point) => rotatePoint(point, rotation));
  const coordinates = rotatedPoints.map((point) => toCoordinate(startCoordinate, point, metersPerUnit));

  let estimatedDistanceMeters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    estimatedDistanceMeters += calculateDistanceBetweenPoints(coordinates[index - 1], coordinates[index]);
  }

  return {
    id: `${template.key}-${Date.now()}`,
    templateKey: template.key,
    displayTitle: buildTitle(template, keyword),
    description: template.description,
    startLabel,
    requestedKeyword: keyword.trim(),
    requestedDistanceKm: clampedDistanceKm,
    estimatedDistanceKm: Number((estimatedDistanceMeters / 1000).toFixed(2)),
    coordinates,
    provider: 'template',
    roadFollowed: false,
  };
}
