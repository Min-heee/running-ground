// Route-param parsers shared by the duel/group reservation-room screens
// (moved verbatim from the two screens' identical local copies).

export function parseNumberParam(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseStringParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}
