import { randomUUID } from 'node:crypto';

export function nextId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
