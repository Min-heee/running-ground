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

    getAdminEvents() {
      return buildAdminOfflineRaceEvents(loadStore());
    },

    applyEntryAction({ token, eventId, action }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const user = requireUserByToken(store, token);
        const event = store.offlineRaceEvents.find((entry) => entry.id === eventId);

        if (!event) {
          throw createError(404, '선택한 레이스를 찾지 못했어.');
        }

        const status = getOfflineRaceStatus(event);

        if (!['registration_open', 'registration_closing'].includes(status)) {
          throw createError(409, '지금은 신청을 처리할 수 없는 회차야.');
        }

        const registeredUserTags = [...new Set(event.registeredUserTags ?? [])];
        const alreadyRegistered = registeredUserTags.includes(user.publicTag);

        if (action === 'join') {
          if (alreadyRegistered) {
            throw createError(409, '이미 신청한 레이스야.');
          }

          if (registeredUserTags.length >= event.capacity) {
            throw createError(409, '정원이 모두 차서 더 이상 신청할 수 없어.');
          }

          event.registeredUserTags = [...registeredUserTags, user.publicTag];
        }

        if (action === 'cancel') {
          if (!alreadyRegistered) {
            throw createError(409, '아직 신청하지 않은 레이스야.');
          }

          event.registeredUserTags = registeredUserTags.filter((tag) => tag !== user.publicTag);
        }

        return {
          success: true,
          event: decorateOfflineRaceEvent(store, event, user),
        };
      });
    },

    createAdminEvent({ input }) {
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

    updateAdminEvent({ eventId, input }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const event = store.offlineRaceEvents.find((entry) => entry.id === eventId);

        if (!event) {
          throw createError(404, '수정할 레이스를 찾지 못했어.');
        }

        Object.assign(event, input);

        return {
          success: true,
          event: buildAdminOfflineRaceEvent(store, event),
          events: buildAdminOfflineRaceEvents(store).events,
        };
      });
    },

    deleteAdminEvent({ eventId }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const nextEvents = store.offlineRaceEvents.filter((entry) => entry.id !== eventId);

        if (nextEvents.length === store.offlineRaceEvents.length) {
          throw createError(404, '삭제할 레이스를 찾지 못했어.');
        }

        store.offlineRaceEvents = nextEvents;
        return buildAdminOfflineRaceEvents(store);
      });
    },
  };
}
