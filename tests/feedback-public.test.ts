import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK_MAX_BODY_LENGTH } from '../shared/feedback.js';
import {
  PUBLIC_FEEDBACK_CATEGORY, PUBLIC_FEEDBACK_LIMITS, imageMatchesType, publicFeedbackBody, publicFeedbackSchema,
} from '../shared/feedbackPublic.js';

// Reports from the public landing page go into the existing แจ้งปัญหา system as one plain-text message (owner, 2026-10-29).

test('a bug report needs the page, what was done before and what happened; an idea does not', () => {
  const base = { subject: 'ปุ่มบันทึกกดไม่ได้', details: 'กดแล้วไม่มีอะไรเกิดขึ้นเลย' };
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'bug' }).success, false);
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'bug', page: 'หน้างาน', steps: 'กรอกงานใหม่', happened: 'ไม่บันทึก' }).success, true);
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'idea' }).success, true);
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'general', email: '' }).success, true);
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'general', email: 'not-an-email' }).success, false);
  // nothing the form does not send
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'idea', userId: 'x' }).success, false);
  assert.equal(publicFeedbackSchema.safeParse({ ...base, kind: 'idea', subject: 'ab' }).success, false);
});

test('the message the team reads: labelled, contact near the top, never over the system limit', () => {
  const input = publicFeedbackSchema.parse({ kind: 'bug', subject: 'x'.repeat(PUBLIC_FEEDBACK_LIMITS.subject), details: 'd'.repeat(PUBLIC_FEEDBACK_LIMITS.details),
    page: 'p'.repeat(PUBLIC_FEEDBACK_LIMITS.page), steps: 's'.repeat(PUBLIC_FEEDBACK_LIMITS.steps), happened: 'h'.repeat(PUBLIC_FEEDBACK_LIMITS.happened),
    email: `${'a'.repeat(240)}@example.com` });
  const body = publicFeedbackBody(input, true);
  assert.ok(body.length <= FEEDBACK_MAX_BODY_LENGTH, `${body.length}`);
  // the longest report still ends with what happened (nothing is cut off)
  assert.ok(body.endsWith('h'.repeat(PUBLIC_FEEDBACK_LIMITS.happened)));
  const lines = body.split('\n');
  assert.equal(lines[0], '[จากหน้าเว็บ · ผู้ส่งยังไม่ได้เข้าสู่ระบบ]');
  assert.equal(lines[1], 'ประเภท: แจ้งปัญหา / บั๊ก');
  assert.ok(lines[3].startsWith('อีเมลติดต่อกลับ: aaaa'));
  assert.equal(lines[4], 'ภาพประกอบ: 1 ไฟล์ ส่งไปที่อีเมลของทีม');
  const idea = publicFeedbackBody(publicFeedbackSchema.parse({ kind: 'idea', subject: 'อยากได้โหมดมืด', details: 'ช่วงกลางคืนใช้แล้วแสบตา' }), false);
  assert.match(idea, /อีเมลติดต่อกลับ: ไม่ได้ให้ไว้/);
  assert.match(idea, /ภาพประกอบ: ไม่มี/);
  assert.doesNotMatch(idea, /หน้าที่พบปัญหา/);
  assert.deepEqual(PUBLIC_FEEDBACK_CATEGORY, { bug: 'bug', idea: 'idea', general: 'other' });
});

test('a picture must really be the type it claims', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const html = new TextEncoder().encode('<html><body>');
  assert.equal(imageMatchesType(png, 'image/png'), true);
  assert.equal(imageMatchesType(jpeg, 'image/jpeg'), true);
  assert.equal(imageMatchesType(webp, 'image/webp'), true);
  assert.equal(imageMatchesType(html, 'image/png'), false);
  assert.equal(imageMatchesType(png, 'image/jpeg'), false);
});

test('the public route is wired with its own size limit, the same-origin check and its own rate group', () => {
  const router = readFileSync(new URL('../backend/src/http/router.ts', import.meta.url), 'utf8');
  assert.match(router, /routes\['feedback-public'\] = feedbackPublic;/);
  assert.match(router, /route==='feedback-public'\?3\*1024\*1024/);
  assert.match(router, /'feedback','feedback-public','assistant'\]\.includes\(route\)/);
  const ingress = readFileSync(new URL('../backend/src/security/ingress.ts', import.meta.url), 'utf8');
  assert.match(ingress, /'feedback-public': \{ group: 'feedback-public', limit: 10 \}/);
  const handler = readFileSync(new URL('../backend/src/handlers/feedback-public.ts', import.meta.url), 'utf8');
  // the existing system's function, never a new table; and the honeypot is checked after the rate limits
  assert.match(handler, /rpc\('cashflow_feedback_mutate'/);
  assert.ok(handler.indexOf("rateLimit('feedback-public-ip'") < handler.indexOf('if (input.website)'));
});
