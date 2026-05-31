import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMatchSetupActiveTab,
  resetMatchSetupActiveTabsForTest,
  setMatchSetupActiveTab,
} from './matchSetupTabStore';

test('match setup tab store defaults to date', () => {
  resetMatchSetupActiveTabsForTest();

  assert.equal(getMatchSetupActiveTab('duel'), 'date');
});

test('match setup tab store remembers the last tab by key', () => {
  resetMatchSetupActiveTabsForTest();

  setMatchSetupActiveTab('duel', 'time');

  assert.equal(getMatchSetupActiveTab('duel'), 'time');
});

test('match setup tab store keeps duel and group keys separate', () => {
  resetMatchSetupActiveTabsForTest();

  setMatchSetupActiveTab('duel', 'time');
  setMatchSetupActiveTab('group', 'distance');

  assert.equal(getMatchSetupActiveTab('duel'), 'time');
  assert.equal(getMatchSetupActiveTab('group'), 'distance');
});
