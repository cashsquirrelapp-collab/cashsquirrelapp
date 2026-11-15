import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_FEATURES, LAB_IDS, NO_LABS, RELEASED_LABS, labOn, labReady, labState, readLabs } from '../shared/labs';

// ฟีเจอร์ทดลอง (owner, 2026-11-12): new features open for testers first, in Settings; since 2026-11-16 the built ones are
// released to every account.

test('labs: a stored record is read strictly; unknown shapes and unknown features count as nothing', () => {
  assert.deepEqual(readLabs(undefined), { tester: false, on: [] });
  assert.deepEqual(readLabs('yes'), { tester: false, on: [] });
  assert.deepEqual(readLabs({ tester: 'true', on: 'sheets' }), { tester: false, on: [] });
  assert.deepEqual(readLabs({ tester: true, on: ['sheets', 'sheets', 'rocket', 7], at: '2026-11-12T10:00:00.000Z' }),
    { tester: true, on: ['sheets'], at: '2026-11-12T10:00:00.000Z' });
});

const RELEASED = ['sheets', 'excel', 'sheetMap', 'sheetWrite', 'sheetJobs', 'templates', 'filingCalendar'];

test('labs: the 7 built features are released to every account; the rest open only for testers once built', () => {
  // Released on 2026-11-16 (owner: "ฟีเจอร์ทดลองอ่ะไม่ต้องให้มันเป็นฟีเจอร์ทดลองละ เอาเรียกมันมาใช้จริงได้เลย").
  assert.deepEqual([...RELEASED_LABS], RELEASED);
  assert.deepEqual(LAB_FEATURES.filter(feature => feature.ready).map(feature => feature.id), RELEASED);
  assert.deepEqual(labState({ tester: false, on: [] }, true), { tester: true, on: RELEASED }, 'the owner');
  assert.deepEqual(labState({ tester: false, on: [] }, false), { tester: false, on: RELEASED }, 'any account');
  assert.deepEqual(labState({ tester: false, on: ['projects'] }, false), { tester: false, on: RELEASED }, 'not a tester: nothing more opens');
  // Still being built: closed even for a tester who turned them on.
  assert.deepEqual(labState({ tester: true, on: ['accountant', 'projects', 'filingCalendar'] }, false), { tester: true, on: RELEASED });
  assert.equal(labOn(labState({ tester: true, on: ['projects'] }, false), 'projects'), false);
  for (const id of RELEASED) assert.equal(labOn(labState({ tester: false, on: [] }, false), id as typeof LAB_IDS[number]), true, id);
  assert.equal(labOn(NO_LABS, 'filingCalendar'), false, 'not read yet: nothing');
  assert.equal(labOn(null, 'filingCalendar'), false);
  for (const id of LAB_IDS) assert.equal(labReady(id), RELEASED.includes(id), id);
});

test('labs: every feature has Thai words a tester can read, and no AI vendor names', () => {
  assert.equal(new Set(LAB_IDS).size, LAB_FEATURES.length);
  for (const feature of LAB_FEATURES) {
    assert.ok(feature.th.length > 2 && feature.desc.length > 10, feature.id);
    assert.doesNotMatch(`${feature.th} ${feature.desc}`, /gemini|claude|openai|gpt|anthropic|supabase|cloudflare/i, feature.id);
  }
});
