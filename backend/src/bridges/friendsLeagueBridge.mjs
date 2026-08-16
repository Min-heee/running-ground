function isApiErrorWithStatus(error, statuses) {
  return typeof error?.statusCode === 'number' && statuses.includes(error.statusCode);
}

function hasFriendLeaderboardContent(payload) {
  return Array.isArray(payload?.ranks) && payload.ranks.length > 0
    || Array.isArray(payload?.requests) && payload.requests.length > 0;
}

function hasTodayRankingContent(payload) {
  return Array.isArray(payload?.entries) && payload.entries.length > 0;
}

function isEmptyRegionLeaguePayload(payload) {
  return payload?.currentNode?.id === 'region-root'
    && Array.isArray(payload?.breadcrumb)
    && payload.breadcrumb.length === 1
    && Array.isArray(payload?.children)
    && payload.children.length === 0;
}

export function createFriendsLeagueBridge({
  sessionRunsBridge,
  friendsRepository,
  postgresFriendsRepository = null,
  leagueRepository,
  postgresLeagueRepository = null,
  friendReadsEnabled = false,
  leagueReadsEnabled = false,
}) {
  if (!sessionRunsBridge || typeof sessionRunsBridge.findUserByToken !== 'function') {
    throw new Error('createFriendsLeagueBridge requires a sessionRunsBridge with findUserByToken.');
  }

  if (!friendsRepository) {
    throw new Error('createFriendsLeagueBridge requires a friendsRepository.');
  }

  if (!leagueRepository) {
    throw new Error('createFriendsLeagueBridge requires a leagueRepository.');
  }

  async function resolveCurrentUser({ store, token }) {
    const result = await sessionRunsBridge.findUserByToken({
      store,
      token,
    });

    return result.user;
  }

  return {
    getConfig() {
      return {
        friendReadsEnabled,
        leagueReadsEnabled,
        postgresFriendsConfigured: Boolean(postgresFriendsRepository),
        postgresLeagueConfigured: Boolean(postgresLeagueRepository),
      };
    },

    async getFriendLeaderboard({
      store,
      token,
      fallbackToJsonIfEmpty = true,
      fallbackToJsonOnReadError = true,
    }) {
      if (friendReadsEnabled && postgresFriendsRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          const payload = await postgresFriendsRepository.getLeaderboardByUserId({
            currentUserId: currentUser.id,
          });

          if (hasFriendLeaderboardContent(payload) || !fallbackToJsonIfEmpty) {
            return {
              payload,
              source: 'postgres',
            };
          }
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 403, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await friendsRepository.getLeaderboard({ token }),
        source: 'json',
      };
    },

    async getFriendActivity({
      store,
      token,
      friendId,
      fallbackToJsonOnReadError = true,
    }) {
      if (friendReadsEnabled && postgresFriendsRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          return {
            payload: await postgresFriendsRepository.getFriendActivityByUserId({
              currentUserId: currentUser.id,
              friendId,
            }),
            source: 'postgres',
          };
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 403, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await friendsRepository.getFriendActivity({ token, friendId }),
        source: 'json',
      };
    },

    async getFriendRun({
      store,
      token,
      friendId,
      runId,
      fallbackToJsonOnReadError = true,
    }) {
      if (friendReadsEnabled && postgresFriendsRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          return {
            payload: await postgresFriendsRepository.getFriendRunByUserId({
              currentUserId: currentUser.id,
              friendId,
              runId,
            }),
            source: 'postgres',
          };
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 403, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await friendsRepository.getFriendRun({ token, friendId, runId }),
        source: 'json',
      };
    },

    async getDistrictPersonal({
      store,
      token,
      nodeId,
      fallbackToJsonOnReadError = true,
    }) {
      if (leagueReadsEnabled && postgresLeagueRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          return {
            payload: await postgresLeagueRepository.getDistrictPersonalByUserId({
              currentUserId: currentUser.id,
              nodeId,
            }),
            source: 'postgres',
          };
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await leagueRepository.getDistrictPersonal({ token, nodeId }),
        source: 'json',
      };
    },

    async getRegions({
      store,
      token,
      nodeId,
      fallbackToJsonIfEmpty = true,
      fallbackToJsonOnReadError = true,
    }) {
      if (leagueReadsEnabled && postgresLeagueRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          const payload = await postgresLeagueRepository.getRegionsByUserId({
            currentUserId: currentUser.id,
            nodeId,
          });

          if (!isEmptyRegionLeaguePayload(payload) || !fallbackToJsonIfEmpty) {
            return {
              payload,
              source: 'postgres',
            };
          }
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await leagueRepository.getRegions({ token, nodeId }),
        source: 'json',
      };
    },

    // 우주 탭은 JSON 리포 전용이다. postgres 정규화 리그 리포에는 월간 우승 봉인 스윕도 별
    // 장식도 아직 없어서(monthlyRankingStars.mjs 이관 주의 참고) 거기서 읽으면 항성이 통째로
    // 증발한다 — LEAGUE_READS를 켤 때 스윕/별과 함께 이 경로도 같이 이식해야 한다.
    async getUniverse({ token, nodeId }) {
      return {
        payload: await leagueRepository.getUniverse({ token, nodeId }),
        source: 'json',
      };
    },

    // 검색도 같은 이유로 JSON 리포 전용 — 목적지 은하가 우주 트리와 어긋나면 안 된다.
    async searchUniverse({ token, query }) {
      return {
        payload: await leagueRepository.searchUniverse({ token, query }),
        source: 'json',
      };
    },

    async getTodayRankings({
      store,
      token,
      category,
      fallbackToJsonIfEmpty = true,
      fallbackToJsonOnReadError = true,
    }) {
      if (leagueReadsEnabled && postgresLeagueRepository) {
        const currentUser = await resolveCurrentUser({ store, token });

        try {
          const payload = await postgresLeagueRepository.getTodayRankingsByUserId({
            category,
            currentUserId: currentUser.id,
          });

          if (hasTodayRankingContent(payload) || !fallbackToJsonIfEmpty) {
            return {
              payload,
              source: 'postgres',
            };
          }
        } catch (error) {
          if (!fallbackToJsonOnReadError || !isApiErrorWithStatus(error, [401, 404])) {
            throw error;
          }
        }
      }

      return {
        payload: await leagueRepository.getTodayRankings({ token, category }),
        source: 'json',
      };
    },
  };
}
