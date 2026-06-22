import { Platform } from 'react-native';
import { USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI } from '@/components/matches/liveMatchArena/config';
import { isRunnerForfeited } from '@/components/matches/liveMatchArenaVisualState';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

export const ROAD_HEIGHT_DUEL = 432;
export const ROAD_HEIGHT_GROUP = 432;
export const ROAD_STRIPE_HEIGHT = 34;
export const ROAD_STRIPE_SPACING = 88;
export const GROUP_ROW_HEIGHT = 78;
// Top padding that keeps the first group row (and its runner marker) clear of the
// absolutely-positioned FINISH banner. It must be reflected in getItemLayout offsets
// so that initialScrollIndex/scrollToIndex land row 0 *below* the banner on Android,
// which (unlike iOS) does not preserve contentContainerStyle.paddingTop when scrolling
// to a getItemLayout offset.
export const GROUP_LIST_TOP_INSET = 56;
export const GROUP_LIST_BOTTOM_INSET = 72;
export const SHOULD_ANIMATE_ROAD = !USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI;
export const DUEL_STRIPE_COUNT = USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 4 : 12;
export const GROUP_STRIPE_COUNT = USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 5 : 14;
export const ANDROID_GROUP_LIGHT_MODE_THRESHOLD = 12;
export const DUEL_STRIPES = Array.from({ length: DUEL_STRIPE_COUNT });
export const GROUP_STRIPES = Array.from({ length: GROUP_STRIPE_COUNT });
const ANDROID_RENDER_DISTANCE_PRECISION = 2;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function shouldShowRunnerBubble(participant: ArenaParticipant) {
  return Boolean(participant.showPaceBubble && participant.paceLabel.trim());
}

export function isForfeited(participant: ArenaParticipant) {
  return isRunnerForfeited(participant);
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

function roundDistanceKmForAndroidRender(distanceKm: number) {
  const factor = 10 ** ANDROID_RENDER_DISTANCE_PRECISION;
  return Math.round(distanceKm * factor) / factor;
}

function getComparableDistanceKm(distanceKm: number) {
  return Platform.OS === 'android' ? roundDistanceKmForAndroidRender(distanceKm) : distanceKm;
}

export function buildAndroidRenderParticipants(participants: ArenaParticipant[]) {
  if (Platform.OS !== 'android') {
    return participants;
  }

  return participants.map((participant) => {
    const roundedDistanceKm = getComparableDistanceKm(participant.distanceKm);

    if (roundedDistanceKm === participant.distanceKm) {
      return participant;
    }

    return {
      ...participant,
      distanceKm: roundedDistanceKm,
    };
  });
}

export function buildParticipantPerfSignature(participants: ArenaParticipant[]) {
  return participants
    .map((participant) => [
      participant.id,
      getComparableDistanceKm(participant.distanceKm).toFixed(2),
      participant.paceLabel,
      participant.liveStatus ?? '',
      participant.rankLabel ?? '',
      participant.resultLabel ?? '',
      participant.finishedAt ?? '',
      participant.isCurrentUser ? 'me' : 'runner',
      participant.emphasis ?? '',
      participant.showPaceBubble ? 'bubble' : 'no-bubble',
    ].join(':'))
    .join('|');
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
    && getComparableDistanceKm(left.distanceKm) === getComparableDistanceKm(right.distanceKm)
    && left.rankLabel === right.rankLabel
    && left.resultLabel === right.resultLabel
    && left.finishedAt === right.finishedAt
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
