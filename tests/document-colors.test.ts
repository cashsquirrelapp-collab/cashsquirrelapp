import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastOnWhite, documentColorOf, isDocumentColorValue } from '../shared/documentColors.js';
import { applyDocumentBranding } from '../shared/documentBranding.js';

test('document colour: presets, hand-picked hex, and anything else stays orange', () => {
  assert.equal(documentColorOf(undefined).accent, '#E65F2B');
  assert.equal(documentColorOf('navy').accent, '#1F3F73');
  assert.equal(documentColorOf('rainbow').key, 'orange');
  const picked = documentColorOf('#1D6B66');
  assert.equal(picked.custom, true);
  assert.equal(picked.accent, '#1D6B66');
  assert.match(picked.tint, /^#[0-9A-F]{6}$/);
});

test('document colour: a light hand-picked colour prints dark enough to read on white', () => {
  const light = documentColorOf('#FFE066');
  assert.notEqual(light.accent, '#FFE066');
  assert.ok(contrastOnWhite(light.accent) >= 3);
});

test('document colour: only preset keys and #rrggbb are saved', () => {
  for (const ok of ['orange', 'black', '#a1b2c3']) assert.equal(isDocumentColorValue(ok), true);
  for (const bad of ['red', '#abc', 'url(x)', '#12345g', 5]) assert.equal(isDocumentColorValue(bad), false);
});

test('document colour: the saved colour reaches documents with the rest of the branding', () => {
  const invoice = { issuer: { name: 'A', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '1', bankAccountName: '' } } as any;
  assert.equal(applyDocumentBranding(invoice, { ...invoice.issuer, docColor: 'plum' }).issuer.docColor, 'plum');
  assert.equal(applyDocumentBranding({ ...invoice, issuer: { ...invoice.issuer, docColor: 'navy' } }, invoice.issuer).issuer.docColor, 'navy');
});

test('one document\'s own issuer: typed details, saved logo and signature only when ticked, never replaced by the profile', async () => {
  const { documentIssuerFor, profileWithIssuerDetails } = await import('../shared/documentBranding.js');
  const profile = { name: 'สตูดิโอกระรอก', address: 'กทม', phone: '1', email: 'a@b.c', taxId: '1', bankName: 'K', bankAccount: '9', bankAccountName: 'S', logoUrl: 'data:logo', signatureUrl: 'data:sig', docColor: 'navy' } as any;
  const typed = { ...profile, name: 'คุณสมชาย', taxId: '3100500000001' };
  const plain = documentIssuerFor(typed, profile, { logo: false, signature: false });
  assert.equal(plain.name, 'คุณสมชาย');
  assert.equal(plain.logoUrl, undefined);
  assert.equal(plain.signatureUrl, undefined);
  assert.equal(plain.docColor, 'navy');
  const branded = documentIssuerFor(typed, profile, { logo: true, signature: true });
  assert.equal(branded.logoUrl, 'data:logo');
  assert.equal(branded.signatureUrl, 'data:sig');
  const invoice = { issuer: plain, issuerCustom: true } as any;
  assert.equal(applyDocumentBranding(invoice, profile), invoice);
  assert.equal(profileWithIssuerDetails(profile, typed).name, 'คุณสมชาย');
  assert.equal(profileWithIssuerDetails(profile, typed).logoUrl, 'data:logo');
});
