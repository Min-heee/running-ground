import { buildAdminLiveActivity } from '../lib/adminLiveActivity.mjs';
import { recordVanishedMatch } from '../lib/vanishedMatchTombstones.mjs';

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

    // 렉걸린/좀비 대결 세션 강제 정리. 세션과 그 세션에 연결된 파티방을 함께
    // 지우고 툼스톤을 기록해, 아직 폴링 중인 기기가 404 재시도 루프 대신 410
    // (match_gone)으로 깔끔하게 빠져나오게 한다.
    async deleteLiveMatchSession({ sessionId }) {
      return mutateStore((store) => {
        const session = (store.matchSessions ?? []).find((entry) => entry.id === sessionId);

        if (!session) {
          throw createError(404, '해당 대결 세션을 찾지 못했어요.');
        }

        store.matchSessions = store.matchSessions.filter((entry) => entry.id !== sessionId);
        store.matchRooms = (store.matchRooms ?? []).filter((entry) => entry.linkedMatchId !== sessionId);
        recordVanishedMatch(sessionId);
        return buildAdminLiveActivity(store);
      });
    },

    // 대기방 강제 정리. 이미 세션이 연결된 방이면 그 세션까지 함께 지운다.
    async deleteLiveMatchRoom({ roomId }) {
      return mutateStore((store) => {
        const room = (store.matchRooms ?? []).find((entry) => entry.id === roomId);

        if (!room) {
          throw createError(404, '해당 방을 찾지 못했어요.');
        }

        store.matchRooms = store.matchRooms.filter((entry) => entry.id !== roomId);

        if (room.linkedMatchId) {
          store.matchSessions = (store.matchSessions ?? []).filter((entry) => entry.id !== room.linkedMatchId);
          recordVanishedMatch(room.linkedMatchId);
        }

        return buildAdminLiveActivity(store);
      });
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
          // 관리자 삭제도 애플 토큰 철회(5.1.1) 대상 — 라우트가 쓰고 응답에서 제거.
          appleRefreshToken: (deletedUser.socialAccounts ?? [])
            .find((account) => account.provider === 'apple')?.refreshToken ?? null,
        };
      });
    },
  };
}
