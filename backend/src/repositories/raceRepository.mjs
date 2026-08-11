import { formDueLiveGroupRaceSessions } from '../lib/raceEventFormation.mjs';

export function createJsonRaceRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  ensureOfflineRaceStore,
  buildOfflineRaceHub,
  buildAdminOfflineRaceEvents,
  buildAdminOfflineRaceEvent,
  decorateOfflineRaceEvent,
  getOfflineRaceStatus,
  nextId,
  createError,
}) {
  return {
    getHubForUser({ store, user }) {
      return buildOfflineRaceHub(store, user);
    },

    async getAdminEvents() {
      return buildAdminOfflineRaceEvents(await loadStore());
    },

    // 8·15런 편성 스윕 — 허브 GET이 부른다. 편성할 게 없으면 store가 안 바뀌어 mutateStore의
    // 무변경 직렬화 스킵이 저장을 건너뛴다 (폴마다 불러도 무비용).
    async sweepLiveGroupFormation() {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        return { formed: formDueLiveGroupRaceSessions(store) };
      });
    },

    async applyEntryAction({ token, eventId, action, password }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const user = requireUserByToken(store, token);
        const event = store.offlineRaceEvents.find((entry) => entry.id === eventId);

        if (!event) {
          throw createError(404, '선택한 레이스를 찾지 못했어요.');
        }

        const status = getOfflineRaceStatus(event);

        if (!['registration_open', 'registration_closing'].includes(status)) {
          throw createError(409, '지금은 신청을 처리할 수 없는 회차예요.');
        }

        const registeredUserTags = [...new Set(event.registeredUserTags ?? [])];
        const alreadyRegistered = registeredUserTags.includes(user.publicTag);

        if (action === 'join') {
          if (alreadyRegistered) {
            throw createError(409, '이미 신청한 레이스예요.');
          }

          // 비밀번호 걸린 이벤트(테스트/비공개 회차): 서버가 보관한 값과 대조. 허브 payload에는
          // passwordRequired(불리언)만 나가고 비밀번호 자체는 절대 안 나간다.
          if (event.joinPassword && String(password ?? '').trim() !== event.joinPassword) {
            throw createError(403, '참가 비밀번호가 올바르지 않아요.');
          }

          if (registeredUserTags.length >= event.capacity) {
            throw createError(409, '정원이 모두 차서 더 이상 신청할 수 없어요.');
          }

          event.registeredUserTags = [...registeredUserTags, user.publicTag];
        }

        if (action === 'cancel') {
          if (!alreadyRegistered) {
            throw createError(409, '아직 신청하지 않은 레이스예요.');
          }

          event.registeredUserTags = registeredUserTags.filter((tag) => tag !== user.publicTag);
        }

        return {
          success: true,
          event: decorateOfflineRaceEvent(store, event, user),
        };
      });
    },

    async createAdminEvent({ input }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const event = {
          id: nextId('race'),
          ...input,
          registeredUserTags: [],
        };

        store.offlineRaceEvents.push(event);

        return {
          success: true,
          event: buildAdminOfflineRaceEvent(store, event),
          events: buildAdminOfflineRaceEvents(store).events,
        };
      });
    },

    async updateAdminEvent({ eventId, input }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const event = store.offlineRaceEvents.find((entry) => entry.id === eventId);

        if (!event) {
          throw createError(404, '수정할 레이스를 찾지 못했어요.');
        }

        Object.assign(event, input);

        return {
          success: true,
          event: buildAdminOfflineRaceEvent(store, event),
          events: buildAdminOfflineRaceEvents(store).events,
        };
      });
    },

    async deleteAdminEvent({ eventId }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const nextEvents = store.offlineRaceEvents.filter((entry) => entry.id !== eventId);

        if (nextEvents.length === store.offlineRaceEvents.length) {
          throw createError(404, '삭제할 레이스를 찾지 못했어요.');
        }

        store.offlineRaceEvents = nextEvents;
        return buildAdminOfflineRaceEvents(store);
      });
    },
  };
}
