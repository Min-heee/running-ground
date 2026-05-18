import { useSyncExternalStore } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';

type Listener = () => void;

let currentMatchRoom: RunningMatchRoom | null = null;
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Keep one subscriber failure from blocking the rest.
    }
  });
}

export function getMatchRoom(): RunningMatchRoom | null {
  return currentMatchRoom;
}

export function setMatchRoom(next: RunningMatchRoom | null): void {
  if (currentMatchRoom === next) {
    return;
  }

  currentMatchRoom = next;
  emitChange();
}

export function subscribeMatchRoom(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMatchRoomStore(): RunningMatchRoom | null {
  return useSyncExternalStore(subscribeMatchRoom, getMatchRoom, getMatchRoom);
}

export function resetMatchRoomStoreForTesting(): void {
  currentMatchRoom = null;
  listeners.clear();
}
