import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bangkokMinutes, effectiveThemePreference, nextSwitchText, readThemePreference, schedulePeriod, scheduleIsDark, shouldOfferThemeTip,
} from '../shared/themeSchedule';

// Light and dark by the clock or by hand, chosen per account (owner, 2026-10-30). Times are Bangkok wall-clock times.
const at = (bangkok: string) => new Date(`${bangkok}+07:00`);
const usual = { darkFrom: '18:00', lightFrom: '06:00' };

test('the schedule follows Bangkok time, across midnight or within one day', () => {
  assert.equal(bangkokMinutes(at('2026-10-30T18:30:00')), 18 * 60 + 30);
  assert.equal(scheduleIsDark(usual, at('2026-10-30T17:59:00')), false);
  assert.equal(scheduleIsDark(usual, at('2026-10-30T18:00:00')), true);
  assert.equal(scheduleIsDark(usual, at('2026-10-31T05:59:00')), true);
  assert.equal(scheduleIsDark(usual, at('2026-10-31T06:00:00')), false);
  const nap = { darkFrom: '13:00', lightFrom: '15:00' };
  assert.deepEqual(['12:59', '13:00', '14:59', '15:00'].map(time => scheduleIsDark(nap, at(`2026-10-30T${time}:00`))), [false, true, true, false]);
  assert.equal(nextSwitchText(usual, at('2026-10-30T20:00:00')), 'สลับเป็นโหมดสว่างตอน 06:00');
  assert.equal(nextSwitchText({ darkFrom: '19:30', lightFrom: '07:00' }, at('2026-10-30T09:00:00')), 'สลับเป็นโหมดมืดตอน 19:30');
});

test('a change by hand holds until the next switch; the usual schedule keeps the number devices already saved', () => {
  // the number the app has always stored for 18:00 / 06:00
  const legacy = (now: Date) => String(Math.floor((now.getTime() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3)));
  for (const time of ['2026-10-30T07:00:00', '2026-10-30T19:00:00', '2026-10-31T02:00:00']) assert.equal(schedulePeriod(usual, at(time)), legacy(at(time)));
  const custom = { darkFrom: '20:00', lightFrom: '07:00' };
  const evening = schedulePeriod(custom, at('2026-10-30T20:10:00'));
  assert.equal(schedulePeriod(custom, at('2026-10-31T06:50:00')), evening, 'still the same night');
  assert.notEqual(schedulePeriod(custom, at('2026-10-31T07:05:00')), evening, 'the morning switch starts a new stretch');
  assert.notEqual(schedulePeriod(custom, at('2026-10-30T19:59:00')), evening);
});

test('saved choices are checked; accounts from before keep 18:00 / 06:00, new ones stay light until they choose', () => {
  assert.deepEqual(readThemePreference({ mode: 'auto', darkFrom: '19:00', lightFrom: '06:30', asked: true }), { mode: 'auto', darkFrom: '19:00', lightFrom: '06:30', asked: true });
  assert.deepEqual(readThemePreference({ mode: 'dark' }), { mode: 'dark', darkFrom: '18:00', lightFrom: '06:00' });
  for (const bad of [null, 'dark', { mode: 'night' }, { mode: 'auto', darkFrom: '07:00', lightFrom: '07:00' }]) assert.equal(readThemePreference(bad), null, JSON.stringify(bad));
  assert.equal(readThemePreference({ mode: 'auto', darkFrom: '25:00' })!.darkFrom, '18:00', 'a broken time falls back');
  assert.equal(effectiveThemePreference(null, { createdAt: '2026-01-01T00:00:00Z' }).mode, 'auto');
  assert.equal(effectiveThemePreference(null, { createdAt: '2026-10-30T12:00:00+07:00' }).mode, 'light');
  assert.equal(effectiveThemePreference(null, null).mode, 'auto');
  assert.equal(effectiveThemePreference({ mode: 'dark', darkFrom: '18:00', lightFrom: '06:00' }, { createdAt: '2026-10-30T12:00:00+07:00' }).mode, 'dark');
});

test('the evening tip: new accounts only, from 18:00 until morning, never again once answered', () => {
  const fresh = '2026-10-30T10:00:00+07:00';
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, now: at('2026-10-30T18:05:00') }), true);
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, now: at('2026-10-31T01:00:00') }), true);
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, now: at('2026-10-30T17:55:00') }), false);
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, now: at('2026-10-31T06:10:00') }), false);
  assert.equal(shouldOfferThemeTip({ saved: { mode: 'light', darkFrom: '18:00', lightFrom: '06:00', asked: true }, createdAt: fresh, now: at('2026-10-31T19:00:00') }), false);
  assert.equal(shouldOfferThemeTip({ saved: { mode: 'dark', darkFrom: '18:00', lightFrom: '06:00' }, createdAt: fresh, now: at('2026-10-31T19:00:00') }), true, 'a quick toggle is not an answer');
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: '2026-01-01T00:00:00Z', now: at('2026-10-30T19:00:00') }), false, 'accounts from before');
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, guest: true, now: at('2026-10-30T19:00:00') }), false);
  assert.equal(shouldOfferThemeTip({ saved: null, createdAt: fresh, groupWorkspace: true, now: at('2026-10-30T19:00:00') }), false);
});
