import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkMarketRedemptionEligibility,
  resolveMarketClaimState,
  type MarketRedemptionCheck,
  type MarketRedemptionItem,
} from './marketRedemption';

function reward(overrides: Partial<MarketRedemptionItem> = {}): MarketRedemptionItem {
  return {
    id: 'reward-1',
    costPoints: 60,
    repeatable: false,
    claimState: 'claimable',
    ...overrides,
  };
}

function failureReason(result: MarketRedemptionCheck) {
  assert.equal(result.canRedeem, false);
  return result.reason;
}

test('market redemption allows a claimable reward and returns remaining points', () => {
  assert.deepEqual(checkMarketRedemptionEligibility(reward(), 100), {
    canRedeem: true,
    itemId: 'reward-1',
    remainingPoints: 40,
  });
  assert.equal(resolveMarketClaimState(reward(), 100), 'claimable');
});

test('market redemption rejects missing, inactive, and out-of-stock rewards', () => {
  assert.deepEqual(checkMarketRedemptionEligibility(null, 100), {
    canRedeem: false,
    reason: 'missing-item',
    message: '교환할 리워드를 찾지 못했어.',
  });
  assert.equal(failureReason(checkMarketRedemptionEligibility(reward({ isActive: false }), 100)), 'inactive');
  assert.equal(failureReason(checkMarketRedemptionEligibility(reward({ remainingStock: 0 }), 100)), 'out-of-stock');
  assert.equal(resolveMarketClaimState(reward({ inventoryCount: 0 }), 100), 'locked');
});

test('market redemption rejects already claimed non-repeatable rewards but allows repeatable rewards', () => {
  const claimedIds = new Set(['reward-1']);

  assert.equal(failureReason(checkMarketRedemptionEligibility(reward(), 100, claimedIds)), 'already-claimed');
  assert.equal(resolveMarketClaimState(reward(), 100, claimedIds), 'claimed');
  assert.deepEqual(checkMarketRedemptionEligibility(reward({ repeatable: true }), 100, claimedIds), {
    canRedeem: true,
    itemId: 'reward-1',
    remainingPoints: 40,
  });
});

test('market redemption rejects insufficient or invalid point values', () => {
  assert.equal(failureReason(checkMarketRedemptionEligibility(reward(), 59)), 'insufficient-points');
  assert.equal(failureReason(checkMarketRedemptionEligibility(reward(), Number.NaN)), 'invalid-points');
  assert.equal(failureReason(checkMarketRedemptionEligibility(reward({ costPoints: -1 }), 100)), 'invalid-points');
});

test('market redemption supports zero-cost rewards without subtracting points', () => {
  assert.deepEqual(checkMarketRedemptionEligibility(reward({ costPoints: 0 }), 0), {
    canRedeem: true,
    itemId: 'reward-1',
    remainingPoints: 0,
  });
});
