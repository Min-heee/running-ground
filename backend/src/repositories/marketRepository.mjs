function createNowIso() {
  return new Date().toISOString();
}

export function createJsonMarketRepository({
  loadStore,
  mutateStore,
  requireUserByToken,
  ensureMarketCatalogStore,
  buildMarketOverviewWithMetrics,
  buildAdminMarketCatalog,
  buildAdminMarketItem,
  buildAdminRewardRedemptions,
  buildAdminRewardRedemption,
  getUserMetrics,
  getAvailableRewardPoints,
  getRedeemedPointCost,
  buildRedemptionCountByItemId,
  getMarketItemRemainingStock,
  isActiveRewardRedemption,
  nextId,
  nowIso = createNowIso,
  createError,
}) {
  return {
    getOverviewForUser({ store, user, metrics }) {
      return buildMarketOverviewWithMetrics(store, user, metrics);
    },

    getAdminCatalog() {
      return buildAdminMarketCatalog(loadStore());
    },

    getAdminRewardRedemptions() {
      return buildAdminRewardRedemptions(loadStore());
    },

    claimItem({ token, itemId }) {
      return mutateStore((store) => {
        const user = requireUserByToken(store, token);
        ensureMarketCatalogStore(store);
        const item = (store.marketCatalog ?? []).find((entry) => entry.id === itemId);

        if (!item) {
          throw createError(404, '교환할 리워드를 찾지 못했어.');
        }

        if (item.isActive === false) {
          throw createError(409, '지금은 비활성화된 리워드라 교환할 수 없어.');
        }

        const alreadyClaimed = (store.rewardRedemptions ?? []).some((entry) => (
          entry.userId === user.id
          && entry.itemId === item.id
          && isActiveRewardRedemption(entry)
        ));
        const remainingStock = getMarketItemRemainingStock(item, buildRedemptionCountByItemId(store).get(item.id) ?? 0);

        if (alreadyClaimed && !item.repeatable) {
          throw createError(409, '이미 교환한 리워드야.');
        }

        if (remainingStock === 0) {
          throw createError(409, '재고가 모두 소진돼서 지금은 교환할 수 없어.');
        }

        if (getAvailableRewardPoints(getUserMetrics(store, user.id), getRedeemedPointCost(store, user.id)) < item.costPoints) {
          throw createError(400, '포인트가 부족해서 아직 교환할 수 없어.');
        }

        if (!Array.isArray(store.rewardRedemptions)) {
          store.rewardRedemptions = [];
        }

        store.rewardRedemptions.push({
          id: nextId('redemption'),
          userId: user.id,
          itemId: item.id,
          costPoints: item.costPoints,
          status: 'requested',
          adminNote: '',
          claimedAt: nowIso(),
        });

        return {
          success: true,
          claimedItemId: item.id,
          overview: buildMarketOverviewWithMetrics(store, user, getUserMetrics(store, user.id)),
        };
      });
    },

    createAdminItem({ input }) {
      return mutateStore((store) => {
        ensureMarketCatalogStore(store);
        const item = {
          id: nextId('market'),
          ...input,
        };

        store.marketCatalog.push(item);

        return {
          success: true,
          item: buildAdminMarketItem(store, item),
          items: buildAdminMarketCatalog(store).items,
        };
      });
    },

    updateAdminItem({ itemId, input }) {
      return mutateStore((store) => {
        ensureMarketCatalogStore(store);
        const item = store.marketCatalog.find((entry) => entry.id === itemId);

        if (!item) {
          throw createError(404, '수정할 마켓 상품을 찾지 못했어.');
        }

        Object.assign(item, input);

        return {
          success: true,
          item: buildAdminMarketItem(store, item),
          items: buildAdminMarketCatalog(store).items,
        };
      });
    },

    deleteAdminItem({ itemId }) {
      return mutateStore((store) => {
        ensureMarketCatalogStore(store);
        const nextItems = store.marketCatalog.filter((entry) => entry.id !== itemId);

        if (nextItems.length === store.marketCatalog.length) {
          throw createError(404, '삭제할 마켓 상품을 찾지 못했어.');
        }

        store.marketCatalog = nextItems;
        return buildAdminMarketCatalog(store);
      });
    },

    updateAdminRewardRedemption({ redemptionId, status, adminNote }) {
      return mutateStore((store) => {
        const redemption = (store.rewardRedemptions ?? []).find((entry) => entry.id === redemptionId);

        if (!redemption) {
          throw createError(404, '수정할 교환 요청을 찾지 못했어.');
        }

        redemption.status = status;
        redemption.adminNote = adminNote;

        if (status === 'fulfilled') {
          redemption.fulfilledAt = nowIso();
        } else if (Object.prototype.hasOwnProperty.call(redemption, 'fulfilledAt')) {
          delete redemption.fulfilledAt;
        }

        return {
          success: true,
          item: buildAdminRewardRedemption(store, redemption),
          items: buildAdminRewardRedemptions(store).items,
        };
      });
    },
  };
}
