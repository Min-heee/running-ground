import { Platform } from 'react-native';
import { isRunnerForfeited } from '@/components/matches/liveMatchArenaVisualState';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

export const ROAD_HEIGHT_DUEL = 432;
export const ROAD_HEIGHT_GROUP = 432;
export const ROAD_STRIPE_HEIGHT = 34;
export const ROAD_STRIPE_SPACING = 88;
export const GROUP_ROW_HEIGHT = 78;
export const SHOULD_ANIMATE_ROAD = Platform.OS !== 'android';
export const DUEL_STRIPE_COUNT = Platform.OS === 'android' ? 6 : 12;
export const GROUP_STRIPE_COUNT = Platform.OS === 'android' ? 7 : 14;
export const ANDROID_GROUP_LIGHT_MODE_THRESHOLD = 12;
export const DUEL_STRIPES = Array.from({ length: DUEL_STRIPE_COUNT });
export const GROUP_STRIPES = Array.from({ length: GROUP_STRIPE_COUNT });

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function shouldShowRunnerBubble(participant: ArenaParticipant) {
  return Boolean(participant.showPaceBubble && participant.paceLabel.trim());
}

export function isForfeited(participant: ArenaParticipant) {
  return isRunnerForfeited(participant);
}

export function buildRemainingLabel(distanceKm: number, targetDistanceKm: number) {
  return `${Math.max(0, targetDistanceKm - distanceKm).toFixed(2)}km 남음`;
}

export function buildAndroidLightParticipants(participants: ArenaParticipant[]) {
  if (Platform.OS !== 'android' || participants.length <= ANDROID_GROUP_LIGHT_MODE_THRESHOLD) {
    return participants;
  }

  const currentUserIndex = participants.findIndex((participant) => participant.isCurrentUser);
  const keepIndexes = new Set<number>([0, 1, 2, participants.length - 1]);

  if (currentUserIndex >= 0) {
    for (let index = currentUserIndex - 3; index <= currentUserIndex + 3; index += 1) {
      if (index >= 0 && index < participants.length) {
        keepIndexes.add(index);
      }
    }
  }

  return participants.filter((_, index) => keepIndexes.has(index));
}

export function sortGroupParticipants(participants: ArenaParticipant[]) {
  return [...participants].sort((left, right) => {
    if (isForfeited(left) !== isForfeited(right)) {
      return isForfeited(left) ? 1 : -1;
    }

    return right.distanceKm - left.distanceKm;
  });
}

export function areParticipantsEqual(left: ArenaParticipant, right: ArenaParticipant) {
  return (
    left.id === right.id
    && left.name === right.name
    && left.paceLabel === right.paceLabel
    && left.bpmLabel === right.bpmLabel
    && left.distanceKm === right.distanceKm
    && left.rankLabel === right.rankLabel
    && left.isCurrentUser === right.isCurrentUser
    && left.isLeader === right.isLeader
    && left.liveStatus === right.liveStatus
    && left.showPaceBubble === right.showPaceBubble
    && left.emphasis === right.emphasis
  );
}

export function areParticipantArraysEqual(left: ArenaParticipant[], right: ArenaParticipant[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((participant, index) => areParticipantsEqual(participant, right[index]));
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
