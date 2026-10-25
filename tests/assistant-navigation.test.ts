import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { automaticNavigation, featureLabelPath, navigationCards, readNavigationMode, safeAssistantPath, saveNavigationMode } from '../frontend/src/features/assistant/assistantNavigation';
import { Markdown } from '../frontend/src/features/assistant/Markdown';
import { createLiveTransport, type AssistantStatus } from '../frontend/src/features/assistant/assistantApi';
import { getCurrentAccount, setCurrentAccount } from '../frontend/src/services/api';
import { confirmationCommand } from '../frontend/src/features/assistant/assistantCommands';

const context = { accountId: 'owner-a', workspaceSlug: 'my-workspace', fullFeatureAccess: false };
const card = { kind: 'navigation', label: 'เอกสาร', path: '/invoice?type=quotation&document=doc-a', autoOpen: true };
test('only exact commands select the sole pending confirmation in the current conversation', () => {
  const proposal = { kind: 'confirm' as const, id: 'proposal-a', title: 'save', changes: [] };
  const message = { id: 'bot', from: 'bot' as const, text: 'preview', at: 1, cards: [proposal] };
  assert.deepEqual(confirmationCommand(' ยืนยันบันทึก ', [message], {}), { action: 'confirm', card: proposal, ambiguous: false });
  assert.equal(confirmationCommand('ยืนยันทุกอย่าง', [message], {}), null);
  assert.equal(confirmationCommand('confirm', [], {}), null);
  assert.equal(confirmationCommand('confirm', [{ ...message, from: 'me' }], {}), null);
  for (const state of ['done', 'working', 'cancelled', 'failed']) assert.equal(confirmationCommand('confirm', [message], { 'proposal-a': state }), null);
  assert.deepEqual(confirmationCommand('cancel', [message, { ...message, id: 'bot-2', cards: [{ ...proposal, id: 'proposal-b' }] }], {}), { action: 'cancel', ambiguous: true });
  assert.equal(confirmationCommand('confirm', [message, message], {})?.card?.id, 'proposal-a');
});
test('navigation binds every route to current workspace and rejects escape or sensitive targets', () => {
  assert.equal(safeAssistantPath('/jobs', context), '/jobs/my-workspace');
  assert.equal(safeAssistantPath(card.path, context), '/invoice/my-workspace?type=quotation&document=doc-a');
  assert.equal(safeAssistantPath('/invoice/my-workspace?document=doc-a', context), '/invoice/my-workspace?document=doc-a');
  for (const path of ['https://foreign.test/jobs', '//foreign.test/jobs', '/\\foreign.test', '/jobs/another-account', '/jobs/my-workspace/other',
    '/jobs?user_id=owner-b', '/jobs?redirect=https://foreign.test', '/jobs#security', '/jobs/../plans', '/jobs/%2e%2e/plans', '/jobs%2Fforeign',
    '/adminDashboard', '/groups', '/api/assistant', '/settings?view=security', '/settings?view=backup', '/invoice?type=wrong',
    '/invoice?document=a&document=b', '/invoice?document=../../private', '/invoice?unknown=1', '/tax', '/vault', '/report']) {
    assert.equal(safeAssistantPath(path, context, true), null, path);
  }
  assert.equal(safeAssistantPath('/settings?view=notif', context), null);
  assert.equal(safeAssistantPath('/settings?view=notif', context, true), '/settings/my-workspace?view=notif');
  assert.equal(safeAssistantPath('/plans', context), null);
  assert.equal(safeAssistantPath('/plans', context, true), '/plans/my-workspace');
  assert.equal(safeAssistantPath('/tax', { ...context, fullFeatureAccess: true }), '/tax/my-workspace');
});

test('automatic opening requires opted-in mode, trusted metadata and matching signed-in account', () => {
  assert.equal(automaticNavigation([card], context, 'manual', 'owner-a'), null);
  assert.equal(automaticNavigation([card], context, 'auto', 'owner-b'), null);
  assert.equal(automaticNavigation([card], { ...context, workspaceSlug: undefined }, 'auto', 'owner-a'), null);
  assert.equal(automaticNavigation([{ ...card, autoOpen: false }], context, 'auto', 'owner-a'), null);
  assert.equal(automaticNavigation([{ kind: 'document', label: 'เอกสาร', path: '/invoice', autoOpen: true }], context, 'auto', 'owner-a'), null);
  assert.equal(automaticNavigation([card], context, 'auto', 'owner-a'), '/invoice/my-workspace?type=quotation&document=doc-a');
  assert.deepEqual(navigationCards([{ ...card, path: '/invoice/owner-b' }, { ...card, autoOpen: 'true' }, null], context), []);
});

test('preferences are isolated per account and default to manual without storage permission', () => {
  const values = new Map<string,string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readNavigationMode('owner-a', storage), 'manual');
  saveNavigationMode('owner-a', 'auto', storage);
  assert.equal(readNavigationMode('owner-a', storage), 'auto'); assert.equal(readNavigationMode('owner-b', storage), 'manual');
  saveNavigationMode('owner-b', 'manual', storage); assert.equal(readNavigationMode('owner-a', storage), 'auto');
  assert.equal(readNavigationMode(undefined, storage), 'manual');
  assert.equal(readNavigationMode('owner-a', { ...storage, getItem: () => { throw new Error('disabled'); } }), 'manual');
});

test('bold page names become safe links, while arbitrary model links cannot escape or open restricted pages', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { text: '**เอกสาร** และ **ลูกค้าลับ** [bad](https://foreign.test) [admin](/adminDashboard) [other](/jobs/other)', cards: [card], navigationContext: context, onNavigate: () => {} }));
  assert.match(html, /href="\/invoice\/my-workspace\?type=quotation&amp;document=doc-a"/);
  assert.match(html, /<strong>เอกสาร<\/strong>/); assert.match(html, /<strong>ลูกค้าลับ<\/strong>/);
  assert.equal((html.match(/href=/g) ?? []).length, 1);
  assert.equal(featureLabelPath('เอกสาร', [], context), '/invoice/my-workspace');
  assert.equal(featureLabelPath('ภาษี', [], context), null);
});

const originalFetch = globalThis.fetch; const originalAccount = getCurrentAccount();
afterEach(() => { globalThis.fetch = originalFetch; setCurrentAccount(originalAccount); });
const status: AssistantStatus = { enabled: true, plan: 'pro', tokensLeft: 10, trialLeft: null, resetsAt: null, tokenLimit: 10, requestLimit: null };
test('live metadata arrives before answer typing and sends no unsupported mode fields', async () => {
  setCurrentAccount('owner-a'); const events: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.deepEqual(Object.keys(body).sort(), ['action', 'history', 'text']);
    return Response.json({ text: 'เปิดเอกสารให้แล้ว', cards: [card], tokens: 1, tokensLeft: 9, trialLeft: null });
  };
  const transport = createLiveTransport({ account: 'owner-a', status, instant: true });
  const result = await transport.send({ conversationId: 'one', text: 'เปิดเอกสาร', history: [] }, () => events.push('text'), new AbortController().signal, cards => { assert.deepEqual(cards, [card]); events.push('navigation'); });
  assert.deepEqual(events, ['navigation', 'text']); assert.equal(result.tokensUsed, 1);
});

test('late response after account switch or cancellation cannot navigate, type, or refresh another account', async () => {
  for (const reason of ['account', 'cancel']) {
    setCurrentAccount('owner-a'); let resolve!: (response: Response) => void; let calls = 0; let callbacks = 0;
    globalThis.fetch = async () => { calls++; return new Promise<Response>(done => { resolve = done; }); };
    const transport = createLiveTransport({ account: 'owner-a', status, instant: true }); const controller = new AbortController();
    const pending = transport.send({ conversationId: 'one', text: 'เปิดเอกสาร', history: [] }, () => callbacks++, controller.signal, () => callbacks++);
    if (reason === 'account') setCurrentAccount('owner-b'); else controller.abort();
    resolve(Response.json({ text: 'private old answer', cards: [card], tokens: 1, tokensLeft: 9, trialLeft: null }));
    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(callbacks, 0); assert.equal(calls, 1);
  }
});

test('confirmation returns document location only after saved response, and stale confirmation has no side effects', async () => {
  setCurrentAccount('owner-a'); let applied = 0;
  const transport = createLiveTransport({ account: 'owner-a', status, instant: true, onApplied: () => applied++ });
  globalThis.fetch = async () => Response.json({ status: 'applied', path: card.path, documentId: 'doc-a' });
  const confirm = { kind: 'confirm' as const, id: 'proposal-a', title: 'create', changes: [] };
  assert.deepEqual(await transport.confirm(confirm, new AbortController().signal), { ok: true, path: card.path, documentId: 'doc-a' });
  assert.equal(applied, 1);
  globalThis.fetch = async () => { setCurrentAccount('owner-b'); return Response.json({ status: 'applied', path: card.path }); };
  assert.deepEqual(await transport.confirm(confirm, new AbortController().signal), { ok: false }); assert.equal(applied, 1);
});
