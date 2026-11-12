import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_FEATURES, LAB_IDS, NO_LABS, labOn, labReady, labState, readLabs } from '../shared/labs';

// ฟีเจอร์ทดลอง (owner, 2026-11-12): new features open for testers first, in Settings; everyone else sees nothing.

test('labs: a stored record is read strictly; unknown shapes and unknown features count as nothing', () => {
  assert.deepEqual(readLabs(undefined), { tester: false, on: [] });
  assert.deepEqual(readLabs('yes'), { tester: false, on: [] });
  assert.deepEqual(readLabs({ tester: 'true', on: 'sheets' }), { tester: false, on: [] });
  assert.deepEqual(readLabs({ tester: true, on: ['sheets', 'sheets', 'rocket', 7], at: '2026-11-12T10:00:00.000Z' }),
    { tester: true, on: ['sheets'], at: '2026-11-12T10:00:00.000Z' });
});

test('labs: the owner is always a tester; nothing counts as on unless the account tests it and the feature is built', () => {
  assert.deepEqual(labState({ tester: false, on: [] }, true), { tester: true, on: [] });
  assert.deepEqual(labState({ tester: false, on: ['sheets'] }, false), { tester: false, on: [] }, 'not a tester: nothing opens');
  // Every feature is still being built in this first round, so a tester's switch opens nothing yet.
  assert.equal(LAB_FEATURES.every(feature => !feature.ready), true);
  assert.deepEqual(labState({ tester: true, on: ['sheets', 'projects'] }, false), { tester: true, on: [] });
  assert.equal(labOn(labState({ tester: true, on: ['sheets'] }, false), 'sheets'), false);
  assert.equal(labOn(NO_LABS, 'sheets'), false);
  assert.equal(labOn(null, 'sheets'), false);
  for (const id of LAB_IDS) assert.equal(labReady(id), false, id);
});

test('labs: every feature has Thai words a tester can read, and no AI vendor names', () => {
  assert.equal(new Set(LAB_IDS).size, LAB_FEATURES.length);
  for (const feature of LAB_FEATURES) {
    assert.ok(feature.th.length > 2 && feature.desc.length > 10, feature.id);
    assert.doesNotMatch(`${feature.th} ${feature.desc}`, /gemini|claude|openai|gpt|anthropic|supabase|cloudflare/i, feature.id);
  }
});
