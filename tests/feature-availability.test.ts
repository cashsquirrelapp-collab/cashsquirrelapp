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
  // Owner, 2026-11-04: unreleased pages are the owner's alone; a team admin has the admin page and nothing more.
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'admin', isGuest: false }), false, 'a team admin');
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'admin', isGuest: false, isOwner: false }), false);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'admin', isGuest: false, isOwner: true }), true);
  assert.equal(hasFullFeatureAccess({ userId: 'one', roleUserId: 'one', systemRole: 'user', isOwner: true }), false, 'the role still counts');
});

test('a team admin opens the admin page and no other hidden page', () => {
  assert.equal(isPhaseOneFeatureAvailable('adminDashboard', false, true), true);
  assert.equal(resolvePhaseOneTab('adminDashboard', false, true), 'adminDashboard');
  for (const tab of ['split', 'report', 'tax', 'groups', 'insight']) assert.equal(resolvePhaseOneTab(tab, false, true), 'dashboard', tab);
});

test('phase one keeps core pages, feedback, settings and subscription management reachable', () => {
  // receivables, quotation, notifications and line were released to everyone on 2026-10-20; the vault and 50 ทวิ on 2026-10-31.
  for (const tab of ['dashboard', 'incomeExpense', 'jobs', 'calendar', 'invoice', 'feedback', 'settings', 'plans', 'receivables', 'quotation', 'notifications', 'line', 'vault', 'wht50']) {
    assert.equal(isPhaseOneFeatureAvailable(tab, false), true, tab);
    assert.equal(resolvePhaseOneTab(tab, false), tab);
  }
});

test('hidden pages and legacy entry points fall back before rendering while admins retain access', () => {
  for (const tab of ['split', 'report', 'insight', 'tax', 'groups', 'adminDashboard', 'line-documents', 'unknown-future-feature']) {
    assert.equal(isPhaseOneFeatureAvailable(tab, false), false, tab);
    assert.equal(resolvePhaseOneTab(tab, false), 'dashboard', tab);
    assert.equal(resolvePhaseOneTab(tab, true), tab);
  }
});
