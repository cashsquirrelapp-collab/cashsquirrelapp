#!/usr/bin/env node
// npm audit with a short, reviewed list of exceptions (2026-11-18). GHSA-fc5q-39xc-vjpf (picomatch, every version up to
// the latest, no fixed release) stopped every deploy, although picomatch is only used by the build tools (vite, tinyglobby,
// fdir) and never ships in the Worker people reach. An advisory may be let through only when:
//   - no fixed version exists,
//   - the package is not among the production dependencies (checked here with `npm audit --omit=dev`),
//   - and the review date has not passed.
// Anything else at the level asked for (high by default) fails as `npm audit --audit-level=high` did.
import { execFileSync } from 'node:child_process';

const ALLOWED = [
  { id: 'GHSA-fc5q-39xc-vjpf', pkg: 'picomatch', until: '2026-12-31', why: 'ReDoS on crafted glob patterns; used only while building (vite, tinyglobby, fdir); no fixed release yet' },
];
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const level = (process.argv.find(arg => arg.startsWith('--level='))?.split('=')[1]) || 'high';
const strict = process.argv.includes('--no-exceptions');
if (!LEVELS.includes(level)) { console.error(`security-audit: unknown level ${level}`); process.exit(2); }

function audit(extra = []) {
  let out;
  try { out = execFileSync('npm', ['audit', '--json', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (error) { out = error.stdout; } // npm audit exits 1 when it finds anything
  try { return JSON.parse(out || '{}'); } catch { console.error('security-audit: npm audit gave no report'); process.exit(2); }
}

/** Every advisory in the report: { id, pkg, severity, title, url }. */
function advisories(report) {
  const found = new Map();
  for (const [name, entry] of Object.entries(report.vulnerabilities || {})) {
    for (const via of entry.via || []) {
      if (typeof via !== 'object' || !via) continue;
      const id = String(via.url || '').match(/GHSA-[a-z0-9-]+/i)?.[0] || `npm-${via.source}`;
      found.set(`${id}:${name}`, { id, pkg: via.name || name, severity: via.severity || entry.severity, title: via.title || '', url: via.url || '' });
    }
  }
  return [...found.values()];
}

const today = new Date().toISOString().slice(0, 10);
const atLevel = item => LEVELS.indexOf(item.severity) >= LEVELS.indexOf(level);
const all = advisories(audit()).filter(atLevel);
const inProduction = new Set(advisories(audit(['--omit=dev'])).map(item => item.id));
const failing = [];
const excused = [];
for (const item of all) {
  const rule = strict ? null : ALLOWED.find(allow => allow.id === item.id && allow.pkg === item.pkg);
  if (rule && !inProduction.has(item.id) && today <= rule.until) excused.push({ ...item, rule });
  else failing.push({ ...item, reason: !rule ? 'not excused' : inProduction.has(item.id) ? 'in production dependencies' : `review date ${rule.until} passed` });
}
for (const item of excused) console.log(`security-audit: excused ${item.id} (${item.pkg}, ${item.severity}) until ${item.rule.until}: ${item.rule.why}`);
if (failing.length) {
  for (const item of failing) console.error(`security-audit: ${item.severity} ${item.id} in ${item.pkg} (${item.reason}): ${item.title} ${item.url}`);
  process.exit(1);
}
console.log(`security-audit: no ${level} or higher advisories left${excused.length ? ` (${excused.length} excused, build tools only)` : ''}`);
