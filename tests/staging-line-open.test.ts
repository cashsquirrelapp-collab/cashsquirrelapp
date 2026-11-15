import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { stagingEmailAllowed, stagingGoogleAllowed, stagingLineAllowed, stagingLineOpen } from '../backend/src/security/staging.js';
import { stagingOwnerLine } from '../backend/src/security/stagingUnlock.js';

// The test LINE OA open to anyone (owner, 2026-11-15: "ไลน์กระรอกตุนเงินทดสอบ ... เอาให้ยูเซอร์ธรรมดาแอดมาได้ด้วยนะ ... เดี๋ยวกู
// จะส่งให้เพื่อนกูก่อน"): any LINE user may add it and use it; only LINE opens, and only on the test site.

const read = (file: string) => ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf8')).config as { vars: Record<string, unknown> };
const staging = read('wrangler.staging.jsonc').vars;
const production = read('wrangler.production.jsonc').vars;
const OWNER = 'U' + '0123456789abcdef'.repeat(2);
const FRIEND = 'U' + 'fedcba9876543210'.repeat(2);
const line = { STAGING_LINE: 'enabled', LINE_CHANNEL_ID: '2012039027', LIFF_ID: '2012039027-abcdEFGH',
  LINE_CHANNEL_SECRET: 's'.repeat(32), LINE_CHANNEL_ACCESS_TOKEN: 't'.repeat(40), STAGING_LINE_USER_ID: OWNER };

test('the test site opens its LINE OA to anyone; the real site has no such switch and needs none', () => {
  assert.equal(staging.STAGING_LINE_OPEN, 'enabled');
  assert.equal(production.STAGING_LINE_OPEN, undefined);
  const env = { ...staging, ...line };
  assert.equal(stagingLineOpen(env), true);
  assert.equal(stagingLineAllowed(OWNER, env), true);
  assert.equal(stagingLineAllowed(FRIEND, env), true, 'a friend');
  for (const bad of ['', 'U123', 'friend', undefined, null, 42]) assert.equal(stagingLineAllowed(bad, env), false, String(bad));
  // The real site was never limited, with or without the switch.
  assert.equal(stagingLineAllowed(FRIEND, production), true);
});

test('without the switch, or without the test LINE channel set up, the test site keeps LINE to the owner (or to nobody)', () => {
  const closed = { ...staging, ...line, STAGING_LINE_OPEN: undefined };
  assert.equal(stagingLineAllowed(OWNER, closed), true);
  assert.equal(stagingLineAllowed(FRIEND, closed), false);
  assert.equal(stagingLineAllowed(FRIEND, { ...staging, ...line, STAGING_LINE_OPEN: 'yes' }), false, 'only the exact word');
  // A channel that is not the test channel (for example the real one copied here) opens nothing.
  assert.equal(stagingLineAllowed(FRIEND, { ...staging, ...line, LINE_CHANNEL_ID: '1234567890' }), false);
  assert.equal(stagingLineAllowed(OWNER, { ...staging, ...line, STAGING_LINE: undefined }), false);
  assert.equal(stagingLineOpen({ ...staging, ...line, STRIPE_MODE: 'live' }), false, 'never with live Stripe');
});

test('only LINE opens: website sign-in, e-mail, admin and Pro stay the owner\'s', () => {
  const env = { ...staging, ...line, STAGING_EMAIL: 'enabled', GMAIL_USER: 'kraroapp@gmail.com', GMAIL_APP_PASSWORD: 'p'.repeat(16), STAGING_GOOGLE: 'enabled', STAGING_GOOGLE_TEST_EMAIL: 'cashsquirrelapp@gmail.com' };
  assert.equal(stagingEmailAllowed('friend@example.com', env), false);
  assert.equal(stagingGoogleAllowed('friend@example.com', env), false);
  assert.equal(stagingOwnerLine(FRIEND, { ...env, STAGING_UNLOCK: 'enabled', STAGING_UNLOCK_USER_ID: 'owner' }), false, 'a friend is never the owner');
});
