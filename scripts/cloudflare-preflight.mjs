// Local production configuration validation. This does not authenticate to
// Cloudflare, read secrets, change provider settings, or enable scheduled jobs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const PRODUCTION_DATABASE = 'https://rcllghixkclvkxhvttaw.supabase.co';

// `--staging` checks the test site (wrangler.staging.jsonc, owner 2026-10-31) instead: it must never reach the real
// database, live Stripe or the real domain.
if (process.argv.includes('--staging')) {
  const stagingPath = path.join(root, 'wrangler.staging.jsonc');
  const staged = ts.parseConfigFileTextToJson(stagingPath, fs.readFileSync(stagingPath, 'utf8'));
  if (staged.error) throw new Error('Cloudflare staging configuration is not valid JSONC');
  const config = staged.config;
  const vars = config?.vars || {};
  expect(config?.name === 'cashsquirrel-staging', 'Unexpected staging Worker name');
  expect(config?.account_id === '7cb26b23e102b0d36824da093b2a267c', 'Unexpected Cloudflare account ID');
  expect(config?.main === 'cloudflare/worker.ts', 'The test site must run the same Worker entry as the real site');
  expect(vars.APP_URL === 'https://staging.krarok.com', 'Unexpected staging application origin');
  expect(vars.SUPABASE_URL === 'https://odsdgxeaiqdepriqmaya.supabase.co', 'The test site must use the staging Supabase project');
  expect(!JSON.stringify(config).includes(PRODUCTION_DATABASE.replace('https://', '')), 'The test site must never name the real database');
  expect(vars.STRIPE_MODE === 'test', 'The test site must use Stripe test mode');
  expect(vars.STAGING_MODE === 'integrated', 'STAGING_MODE=integrated turns on the staging safety rules');
  const routes = Array.isArray(config?.routes) ? config.routes : [];
  expect(routes.length === 1 && routes[0]?.pattern === 'staging.krarok.com' && routes[0]?.custom_domain === true,
    'The test site is attached to staging.krarok.com only');
  expect(vars.CRON_ENABLED === 'false' && Array.isArray(config?.triggers?.crons) && config.triggers.crons.length === 0,
    'No scheduled jobs on the test site');
  expect(config?.assets?.directory === './build/frontend' && config?.assets?.run_worker_first === true, 'Unexpected assets settings');
  for (const file of ['cloudflare/worker.ts', 'build/frontend/index.html']) {
    expect(fs.existsSync(path.join(root, file)), `Required file is missing: ${file}`);
  }
  // The pages talk only to their own server; a build that names the real database would reach it from the test site.
  const realHost = PRODUCTION_DATABASE.replace('https://', '');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const built = fs.existsSync(path.join(root, 'build/frontend')) ? walk(path.join(root, 'build/frontend')) : [];
  const naming = built.filter(file => /\.(js|html|json|css|txt|webmanifest)$/.test(file) && fs.readFileSync(file, 'utf8').includes(realHost));
  expect(naming.length === 0, `Built files name the real database: ${naming.map(file => path.relative(root, file)).join(', ')}`);
  if (failures.length) {
    for (const failure of failures) console.error(`Cloudflare staging preflight: ${failure}`);
    process.exit(1);
  }
  console.log('Cloudflare staging configuration checked: staging.krarok.com, staging database, Stripe test mode, no scheduled jobs.');
  process.exit(0);
}

const configPath = path.join(root, 'wrangler.production.jsonc');
const parsed = ts.parseConfigFileTextToJson(configPath, fs.readFileSync(configPath, 'utf8'));
if (parsed.error) throw new Error('Cloudflare production configuration is not valid JSONC');
const config = parsed.config;

expect(config?.name === 'kraroktunngern', 'Unexpected production Worker name');
expect(!config?.vars?.STAGING_MODE, 'The real site must not run with STAGING_MODE');
expect(config?.account_id === '7cb26b23e102b0d36824da093b2a267c', 'Unexpected production Cloudflare account ID');
expect(config?.main === 'cloudflare/worker.ts', 'Unexpected production Worker entry point');
expect(config?.compatibility_date === '2026-10-15', 'Unexpected Worker compatibility date');
for (const flag of ['nodejs_compat', 'enable_nodejs_http_server_modules']) {
  expect(config?.compatibility_flags?.includes(flag), `Missing compatibility flag: ${flag}`);
}
expect(config?.vars?.NODE_ENV === 'production', 'Production mode is required');
// The site's domain is the main address since 2026-10-31; the workers.dev address stays trusted beside it (LINE and
// Stripe webhooks, LIFF), and the domain is attached to this Worker.
expect(config?.vars?.APP_URL === 'https://krarok.com', 'Unexpected production application origin');
expect(String(config?.vars?.APP_EXTRA_ORIGINS || '').split(',').map(value => value.trim()).includes('https://kraroktunngern.cashsquirrelapp.workers.dev'),
  'The workers.dev address must stay trusted (LINE and Stripe webhooks, LIFF)');
expect(Array.isArray(config?.routes) && config.routes.some(route => route?.pattern === 'krarok.com' && route?.custom_domain === true),
  'krarok.com must stay attached as a custom domain');
expect(Array.isArray(config?.routes) && config.routes.some(route => route?.pattern === 'www.krarok.com' && route?.custom_domain === true),
  'www.krarok.com must stay attached (it forwards to krarok.com)');
expect(config?.vars?.SUPABASE_URL === PRODUCTION_DATABASE, 'Unexpected production Supabase project');
expect(config?.vars?.STRIPE_MODE === 'live', 'Production Stripe mode must remain live');
expect(['false', 'true'].includes(config?.vars?.CRON_ENABLED), 'CRON_ENABLED must be exactly false or true as a string');
const crons = config?.triggers?.crons;
const productionCrons = ['0 1 * * *', '0 2 * * *'];
const validCronPair = Array.isArray(crons) && crons.length === productionCrons.length &&
  productionCrons.every(cron => crons.includes(cron));
expect(validCronPair || (config?.vars?.CRON_ENABLED === 'false' && Array.isArray(crons) && crons.length === 0),
  'Use the two production cron triggers, or an empty list only while CRON_ENABLED is false');
expect(config?.assets?.directory === './build/frontend', 'Unexpected frontend assets directory');
expect(config?.assets?.binding === 'ASSETS', 'ASSETS binding is required');
expect(config?.assets?.not_found_handling === 'single-page-application', 'SPA asset handling is required');
expect(config?.assets?.run_worker_first === true,
  'All requests must run through the Worker first to enforce HTTPS before serving assets');
for (const file of ['cloudflare/worker.ts', 'build/frontend/index.html', 'build/frontend/_headers']) {
  expect(fs.existsSync(path.join(root, file)), `Required file is missing: ${file}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`Cloudflare preflight: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Cloudflare local configuration and built assets checked. Cron is ${config.vars.CRON_ENABLED === 'true' ? 'enabled' : 'disabled'}. Authenticated account and provider readiness are not verified by this check.`);
}
