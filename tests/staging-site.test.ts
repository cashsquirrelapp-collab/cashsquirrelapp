import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { isStaging, stagingBaseReady, STAGING_DATABASE, STAGING_ORIGIN } from '../backend/src/security/staging.js';

// The test site at staging.krarok.com (owner, 2026-10-31): the real site's code on its own Worker, with the staging safety
// rules on, its own database and Stripe in test mode. The real site never counts as staging.

const read = (file: string) => {
  const parsed = ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.error, undefined, file);
  return parsed.config;
};
const staging = read('wrangler.staging.jsonc');
const production = read('wrangler.production.jsonc');

test('staging.krarok.com is the test site and its safety rules switch on there', () => {
  assert.equal(STAGING_ORIGIN, 'https://staging.krarok.com');
  assert.equal(isStaging({ APP_URL: 'https://staging.krarok.com' }), true);
  assert.equal(isStaging({ APP_URL: 'https://cashsquirrel-staging.cashsquirrelapp.workers.dev' }), true);
  assert.equal(stagingBaseReady(staging.vars), true);
  assert.equal(stagingBaseReady({ ...staging.vars, APP_URL: 'https://cashsquirrel-staging.cashsquirrelapp.workers.dev' }), true);
});

test('the real site is never staging, and staging is never ready on the real address', () => {
  assert.equal(isStaging(production.vars), false);
  assert.equal(stagingBaseReady({ ...staging.vars, APP_URL: 'https://krarok.com' }), false);
  assert.equal(production.vars.STAGING_MODE, undefined);
});

test('the test site has its own Worker, database, test-mode Stripe and address, and no scheduled jobs', () => {
  assert.equal(staging.name, 'cashsquirrel-staging');
  assert.notEqual(staging.name, production.name);
  assert.equal(staging.main, production.main);
  assert.equal(staging.vars.SUPABASE_URL, STAGING_DATABASE);
  assert.ok(!JSON.stringify(staging).includes(new URL(production.vars.SUPABASE_URL).host));
  assert.equal(staging.vars.STRIPE_MODE, 'test');
  assert.deepEqual(staging.routes, [{ pattern: 'staging.krarok.com', custom_domain: true }]);
  assert.deepEqual(staging.triggers.crons, []);
  assert.equal(staging.vars.CRON_ENABLED, 'false');
});

test('the test site asks search engines not to list it; the real site does not', () => {
  const worker = fs.readFileSync('cloudflare/worker.ts', 'utf8');
  assert.match(worker, /if \(staging\) headers\.set\('X-Robots-Tag', 'noindex, nofollow'\)/);
  assert.match(worker, /finish\(response, path, Boolean\(env\.STAGING_MODE\)\)/);
});
