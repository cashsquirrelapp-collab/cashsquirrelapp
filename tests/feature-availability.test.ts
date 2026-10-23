import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFullFeatureAccess, isPhaseOneFeatureAvailable, resolvePhaseOneTab } from '../shared/featureAvailability';

test('full feature access waits for the trusted role belonging to the current signed-in account', () => {
  assert.equal(hasFullFeatureAccess({}), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one' }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: null }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'two', roleUserId: 'one', systemRole: 'admin' }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'user' }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'admin', isGuest: true }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'admin', isGuest: false }), true);
});

test('phase one keeps core pages, feedback, settings and subscription management reachable', () => {
  // receivables, quotation, notifications and line were released to everyone on 2026-10-20.
  for (const tab of ['dashboard', 'incomeExpense', 'jobs', 'calendar', 'invoice', 'feedback', 'settings', 'plans', 'receivables', 'quotation', 'notifications', 'line']) {
    assert.equal(isPhaseOneFeatureAvailable(tab, false), true, tab);
    assert.equal(resolvePhaseOneTab(tab, false), tab);
  }
});

test('hidden pages and legacy entry points fall back before rendering while admins retain access', () => {
  for (const tab of ['split', 'report', 'insight', 'tax', 'vault', 'wht50', 'groups', 'adminDashboard', 'line-documents', 'unknown-future-feature']) {
    assert.equal(isPhaseOneFeatureAvailable(tab, false), false, tab);
    assert.equal(resolvePhaseOneTab(tab, false), 'dashboard', tab);
    assert.equal(resolvePhaseOneTab(tab, true), tab);
  }
});
