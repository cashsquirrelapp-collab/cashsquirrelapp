import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { STAGING_PRO, stagingOwnerLine, stagingUnlocked } from '../backend/src/security/stagingUnlock.js';

// The owner's test account on staging.krarok.com is unlocked by two test-site settings (owner, 2026-11-13: "ปรับใน
// เซตติ้งให้มันปลดล็อกทั้งหมด ไม่ต้องเติมโปร"). The real site can never meet the rule, whatever is set on it.

const read = (file: string) => {
  const parsed = ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.error, undefined, file);
  return parsed.config;
};
const staging = read('wrangler.staging.jsonc').vars as Record<string, unknown>;
const production = read('wrangler.production.jsonc').vars as Record<string, unknown>;
const ID = '11111111-2222-4333-8444-555555555555';
const unlock = { STAGING_UNLOCK: 'enabled', STAGING_UNLOCK_USER_ID: ID };

test('the named account on the test site is unlocked as an admin-given Pro', () => {
  assert.equal(stagingUnlocked(ID, { ...staging, ...unlock }), true);
  assert.deepEqual(STAGING_PRO, { status: 'active', plan: 'admin_grant', current_period_end: null });
});

test('nobody else, and nothing without both settings', () => {
  assert.equal(stagingUnlocked('99999999-2222-4333-8444-555555555555', { ...staging, ...unlock }), false);
  assert.equal(stagingUnlocked(ID, staging), false);
  assert.equal(stagingUnlocked(ID, { ...staging, STAGING_UNLOCK_USER_ID: ID }), false);
  assert.equal(stagingUnlocked(ID, { ...staging, STAGING_UNLOCK: 'yes', STAGING_UNLOCK_USER_ID: ID }), false);
  assert.equal(stagingUnlocked('', { ...staging, STAGING_UNLOCK: 'enabled', STAGING_UNLOCK_USER_ID: '' }), false);
  assert.equal(stagingUnlocked(undefined, { ...staging, ...unlock }), false);
});

test('the real site is never unlocked, even with both settings copied onto it', () => {
  assert.equal(stagingUnlocked(ID, { ...production, ...unlock }), false);
  assert.equal(stagingUnlocked(ID, { ...production, ...unlock, APP_URL: 'https://staging.krarok.com' }), false);
  assert.equal(stagingUnlocked(ID, { ...staging, ...unlock, SUPABASE_URL: production.SUPABASE_URL }), false);
  assert.equal(stagingUnlocked(ID, { ...staging, ...unlock, STRIPE_MODE: 'live' }), false);
  assert.equal(stagingUnlocked(ID, unlock), false);
});

test('the account linked to the owner\'s own LINE on the test site counts as the owner\'s; nowhere else, never without the unlock', () => {
  const OWNER_LINE = 'U' + '0123456789abcdef'.repeat(2);
  const line = { STAGING_LINE: 'enabled', LINE_CHANNEL_ID: '2012039027', LIFF_ID: '2012039027-abcdEFGH',
    LINE_CHANNEL_SECRET: 's'.repeat(32), LINE_CHANNEL_ACCESS_TOKEN: 't'.repeat(40), STAGING_LINE_USER_ID: OWNER_LINE };
  assert.equal(stagingOwnerLine(OWNER_LINE, { ...staging, ...unlock, ...line }), true);
  assert.equal(stagingOwnerLine('U' + 'f'.repeat(32), { ...staging, ...unlock, ...line }), false, 'another LINE');
  assert.equal(stagingOwnerLine(OWNER_LINE, { ...staging, ...line }), false, 'the unlock is off');
  assert.equal(stagingOwnerLine(OWNER_LINE, { ...production, ...unlock, ...line }), false, 'the real site');
  assert.equal(stagingOwnerLine(undefined, { ...staging, ...unlock, ...line, STAGING_LINE_USER_ID: undefined }), false);
  // เลขา's plan reads it: the owner's allowance for that account.
  const source = fs.readFileSync('backend/src/ai/supabaseDb.ts', 'utf8');
  assert.match(source, /if \(stagingUnlocked\(user\.id\) \|\| await linkedToOwnerLine\(user\.id\)\) return \{ plan: 'admin'/);
});
