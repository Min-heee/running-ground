export function formatDistanceValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatDistanceKm(value: number) {
  return `${value}km`;
}

export function formatPoints(points: number) {
  return `${points}P`;
}

export function formatPeopleCount(count: number) {
  return `${count}명`;
}
