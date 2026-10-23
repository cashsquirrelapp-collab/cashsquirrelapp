// Local production configuration validation. This does not authenticate to
// Cloudflare, read secrets, change provider settings, or enable scheduled jobs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = path.join(root, 'wrangler.production.jsonc');
const parsed = ts.parseConfigFileTextToJson(configPath, fs.readFileSync(configPath, 'utf8'));
if (parsed.error) throw new Error('Cloudflare production configuration is not valid JSONC');
const config = parsed.config;
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config?.name === 'kraroktunngern', 'Unexpected production Worker name');
expect(config?.account_id === '7cb26b23e102b0d36824da093b2a267c', 'Unexpected production Cloudflare account ID');
expect(config?.main === 'cloudflare/worker.ts', 'Unexpected production Worker entry point');
expect(config?.compatibility_date === '2026-10-15', 'Unexpected Worker compatibility date');
for (const flag of ['nodejs_compat', 'enable_nodejs_http_server_modules']) {
  expect(config?.compatibility_flags?.includes(flag), `Missing compatibility flag: ${flag}`);
}
expect(config?.vars?.NODE_ENV === 'production', 'Production mode is required');
expect(config?.vars?.APP_URL === 'https://kraroktunngern.cashsquirrelapp.workers.dev', 'Unexpected production application origin');
expect(config?.vars?.SUPABASE_URL === 'https://rcllghixkclvkxhvttaw.supabase.co', 'Unexpected production Supabase project');
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
for (const route of ['/api', '/api/*']) {
  expect(config?.assets?.run_worker_first?.includes(route), `Missing Worker-first API route: ${route}`);
}
for (const file of ['cloudflare/worker.ts', 'build/frontend/index.html', 'build/frontend/_headers']) {
  expect(fs.existsSync(path.join(root, file)), `Required file is missing: ${file}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`Cloudflare preflight: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Cloudflare local configuration and built assets checked. Cron is ${config.vars.CRON_ENABLED === 'true' ? 'enabled' : 'disabled'}. Authenticated account and provider readiness are not verified by this check.`);
}
