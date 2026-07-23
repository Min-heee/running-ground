import { buildAdminLiveActivity } from '../lib/adminLiveActivity.mjs';

function createNowIso() {
  return new Date().toISOString();
}

export function createJsonAdminRepository({
  loadStore,
  mutateStore,
  ensureNoticeStore,
  ensureOfflineRaceStore,
  ensureIntegrationImports,
  findUserById,
  buildAdminOverview,
  buildAdminUsers,
  buildAdminNotices,
  buildActiveNotices,
  buildNoticeEntry,
  nextId,
  nowIso = createNowIso,
  createError,
}) {
  return {
    async getOverview() {
      return buildAdminOverview(await loadStore());
    },

    // 라이브 현황 (진행 중 세션/대기방/라이브 공유). 빌더가 순수라 직접 import.
    async getLiveActivity() {
      return buildAdminLiveActivity(await loadStore());
    },

    async getUsers() {
      return buildAdminUsers(await loadStore());
    },

    async getNotices() {
      return buildAdminNotices(await loadStore());
    },

    async getActiveNotices() {
      return buildActiveNotices(await loadStore());
    },

    async createNotice({ input }) {
      return mutateStore((store) => {
        ensureNoticeStore(store);
        const timestamp = nowIso();
        const notice = {
          id: nextId('notice'),
          ...input,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        store.notices.push(notice);

        return {
          success: true,
          item: buildNoticeEntry(notice),
          items: buildAdminNotices(store).items,
        };
      });
    },

    async updateNotice({ noticeId, input }) {
      return mutateStore((store) => {
        ensureNoticeStore(store);
        const notice = store.notices.find((entry) => entry.id === noticeId);

        if (!notice) {
          throw createError(404, '수정할 공지를 찾지 못했어요.');
        }

        Object.assign(notice, input, {
          updatedAt: nowIso(),
        });

        return {
          success: true,
          item: buildNoticeEntry(notice),
          items: buildAdminNotices(store).items,
        };
      });
    },

    async deleteNotice({ noticeId }) {
      return mutateStore((store) => {
        ensureNoticeStore(store);
        const nextItems = store.notices.filter((entry) => entry.id !== noticeId);

        if (nextItems.length === store.notices.length) {
          throw createError(404, '삭제할 공지를 찾지 못했어요.');
        }

        store.notices = nextItems;
        return buildAdminNotices(store);
      });
    },

    async deleteUser({ userId }) {
      return mutateStore((store) => {
        ensureOfflineRaceStore(store);
        const deletedUser = findUserById(store, userId);

        store.users = store.users.filter((entry) => entry.id !== userId);
        store.runs = store.runs.filter((entry) => entry.userId !== userId);
        store.sessions = store.sessions.filter((entry) => entry.userId !== userId);
        store.friendships = store.friendships.filter((entry) => !entry.userIds.includes(userId));
        store.friendRequests = store.friendRequests.filter((entry) => entry.requesterId !== userId && entry.receiverId !== userId);
        store.rewardRedemptions = (store.rewardRedemptions ?? []).filter((entry) => entry.userId !== userId);
        store.integrationImports = ensureIntegrationImports(store).filter((entry) => entry.userId !== userId);

        for (const event of store.offlineRaceEvents) {
          event.registeredUserTags = (event.registeredUserTags ?? []).filter((tag) => tag !== deletedUser.publicTag);
        }

        return {
          success: true,
          deletedUserId: deletedUser.id,
          users: buildAdminUsers(store).users,
        };
      });
    },
  };
}
