import { myProfile } from '@/data/mock';
import type { OfflineRaceEvent, OfflineRaceStatus } from '@/domain';
import { getCurrentUserProfile } from '@/lib/session';
import type {
  OfflineRaceEntryActionResponse,
  OfflineRaceHubResponse,
} from '../../types';
import {
  mockApiState,
  type MockOfflineRaceEventState,
} from './state';

export function getOfflineRaceStatus(
  event: Pick<OfflineRaceEvent, 'startsAt' | 'registrationClosesAt'>,
  now = new Date(),
): OfflineRaceStatus {
  const startsAt = new Date(event.startsAt).getTime();
  const registrationClosesAt = new Date(event.registrationClosesAt).getTime();
  const currentTime = now.getTime();

  if (currentTime >= startsAt + 2 * 60 * 60 * 1000) {
    return 'finished';
  }

  if (currentTime >= startsAt) {
    return 'live';
  }

  if (currentTime >= registrationClosesAt) {
    return 'registration_closed';
  }

  if (registrationClosesAt - currentTime <= 3 * 60 * 60 * 1000) {
    return 'registration_closing';
  }

  return 'registration_open';
}

export function buildMyOfflineRacePreview() {
  const profile = getCurrentUserProfile() ?? myProfile;

  return {
    id: 'offline-race-me',
    name: profile.name,
    paceGoal: '5:30/km',
    regionLabel: profile.districtName,
  };
}

export function decorateOfflineRaceEvent(event: MockOfflineRaceEventState): OfflineRaceEvent {
  const profile = getCurrentUserProfile() ?? myProfile;
  const registered = event.registeredUserTags.includes(profile.publicTag);
  const status = getOfflineRaceStatus(event);
  const participantPreview = registered
    ? [buildMyOfflineRacePreview(), ...event.participantPreview.filter((entry) => entry.name !== profile.name)].slice(0, 4)
    : event.participantPreview;

  const { registeredUserTags, ...rest } = event;

  return {
    ...rest,
    participantPreview,
    registered,
    status,
  };
}

export function buildMockOfflineRaceHub(): OfflineRaceHubResponse {
  return {
    featuredEvent: decorateOfflineRaceEvent(mockApiState.offlineRaceHubState.featuredEvent),
    upcomingEvents: mockApiState.offlineRaceHubState.upcomingEvents.map((event) => decorateOfflineRaceEvent(event)),
    pastEvents: mockApiState.offlineRaceHubState.pastEvents.map((event) => ({ ...event })),
    guideSteps: [...mockApiState.offlineRaceHubState.guideSteps],
  };
}

export function mutateMockOfflineRaceRegistration(
  eventId: string,
  action: 'join' | 'cancel',
): OfflineRaceEntryActionResponse {
  const profile = getCurrentUserProfile() ?? myProfile;
  const eventGroups: { type: 'featured' | 'upcoming'; event: MockOfflineRaceEventState; index?: number }[] = [
    { type: 'featured', event: mockApiState.offlineRaceHubState.featuredEvent },
    ...mockApiState.offlineRaceHubState.upcomingEvents.map((event, index) => ({ type: 'upcoming' as const, event, index })),
  ];
  const target = eventGroups.find((entry) => entry.event.id === eventId);

  if (!target) {
    throw new Error('참가할 레이스를 찾지 못했어.');
  }

  const event = target.event;
  const currentStatus = getOfflineRaceStatus(event);

  if (!['registration_open', 'registration_closing'].includes(currentStatus)) {
    throw new Error('지금은 신청 가능한 시간이 아니야.');
  }

  const isRegistered = event.registeredUserTags.includes(profile.publicTag);

  if (action === 'join') {
    if (isRegistered) {
      throw new Error('이미 신청한 레이스야.');
    }

    if (event.participantCount >= event.capacity) {
      throw new Error('정원이 가득 차서 지금은 대기만 받을 수 있어.');
    }

    event.registeredUserTags = [...event.registeredUserTags, profile.publicTag];
    event.participantCount += 1;
  }

  if (action === 'cancel') {
    if (!isRegistered) {
      throw new Error('아직 신청하지 않은 레이스야.');
    }

    event.registeredUserTags = event.registeredUserTags.filter((tag) => tag !== profile.publicTag);
    event.participantCount = Math.max(0, event.participantCount - 1);
  }

  if (target.type === 'featured') {
    mockApiState.offlineRaceHubState = {
      ...mockApiState.offlineRaceHubState,
      featuredEvent: event,
    };
  } else if (typeof target.index === 'number') {
    mockApiState.offlineRaceHubState = {
      ...mockApiState.offlineRaceHubState,
      upcomingEvents: mockApiState.offlineRaceHubState.upcomingEvents.map((item, index) => (index === target.index ? event : item)),
    };
  }

  return {
    success: true,
    event: decorateOfflineRaceEvent(event),
  };
}
