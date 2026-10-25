import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The mic button needs the page to allow the microphone (owner, 2026-10-24: "ฟังก์ชันเสียงยังใช้ไม่ได้").
// Every place that sends Permissions-Policy must allow it for our own site only, and keep camera and
// location off. They must also agree with each other, so no host serves a different rule.

const EXPECTED = 'camera=(), microphone=(self), geolocation=()';
const sources = ['cloudflare/worker.ts', 'backend/src/http/securityHeaders.ts', 'frontend/public/_headers', 'vercel.json'];

test('Permissions-Policy allows the microphone for this site only, the same everywhere', () => {
  for (const file of sources) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const found = [...text.matchAll(/camera=\([^)]*\), microphone=\([^)]*\), geolocation=\([^)]*\)/g)].map(match => match[0]);
    assert.ok(found.length > 0, `${file} sets Permissions-Policy`);
    for (const value of found) assert.equal(value, EXPECTED, file);
  }
});
