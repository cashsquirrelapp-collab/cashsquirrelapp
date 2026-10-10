import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/types';
import { buildCalendarEvents, primaryCalendarEvent } from '../frontend/src/features/calendar/calendarEvents';

const job = (id: string, fields: Partial<Job> = {}): Job => ({
  id,
  name: id,
  type: 'งานทั่วไป',
  client: 'ลูกค้า',
  value: 10_000,
  received: 0,
  pending: 10_000,
  status: 'pending',
  creditTerm: 0,
  payDate: null,
  note: '',
  isPosted: true,
  ...fields,
});

const on = (events: ReturnType<typeof buildCalendarEvents>, date: string) => events.get(date) || [];

test('calendar keeps the appointment and puts a deposit receipt on its actual receipt date', () => {
  const events = buildCalendarEvents([job('deposit', {
    name: 'ถ่ายวิดีโอ',
    value: 8_000,
    received: 4_000,
    pending: 4_000,
    status: 'partial',
    postDate: '2026-09-20',
    depositDate: '2026-09-25',
    depositAmount: 4_000,
    payDate: '2026-10-10',
  })], '2026-10-02');

  assert.deepEqual(on(events, '2026-09-20').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'post', amount: 8_000 },
  ]);
  assert.deepEqual(on(events, '2026-09-25').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'paid', amount: 4_000 },
  ]);
  assert.match(on(events, '2026-09-25')[0].label, /รับมัดจำ/);
  assert.deepEqual(on(events, '2026-10-10').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'creditTerm', amount: 4_000 },
  ]);
});

test('calendar receipt uses net cash after WHT and never invents a gross paid event', () => {
  const events = buildCalendarEvents([
    job('wht', {
      value: 10_000,
      whtRate: 3,
      whtAmount: 300,
      received: 9_700,
      pending: 0,
      status: 'done',
      paymentStatus: 'paid',
      payDate: '2026-10-05',
    }),
    job('zero', { value: 5_000, received: 0, pending: 0, status: 'done', payDate: '2026-10-06' }),
  ], '2026-10-02');

  const receipt = on(events, '2026-10-05').find(event => event.kind === 'paid');
  assert.equal(receipt?.amount, 9_700);
  assert.match(receipt?.label || '', /9,700/);
  assert.doesNotMatch(receipt?.label || '', /10,000/);
  assert.equal(on(events, '2026-10-06').some(event => event.kind === 'paid'), false);
});

test('calendar expands paid and pending installments onto each real receipt and due date', () => {
  const events = buildCalendarEvents([job('installments', {
    name: 'ทำเว็บไซต์',
    value: 30_000,
    received: 10_000,
    pending: 20_000,
    status: 'installment',
    payDate: '2026-11-10',
    installments: [
      { id: 'i1', label: 'งวดที่ 1', amount: 10_000, dueDate: '2026-10-10', paidAt: '2026-10-01', status: 'paid' },
      { id: 'i2', label: 'งวดที่ 2', amount: 10_000, dueDate: '2026-11-10', paidAt: null, status: 'pending' },
      { id: 'i3', label: 'งวดที่ 3', amount: 10_000, dueDate: '2026-12-10', paidAt: null, status: 'pending' },
    ],
  })], '2026-10-02');

  assert.deepEqual(on(events, '2026-10-01').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'paid', amount: 10_000 },
  ]);
  assert.match(on(events, '2026-10-01')[0].label, /งวดที่ 1/);
  assert.deepEqual(on(events, '2026-11-10').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'creditTerm', amount: 10_000 },
  ]);
  assert.match(on(events, '2026-11-10')[0].label, /งวดที่ 2/);
  assert.deepEqual(on(events, '2026-12-10').map(({ kind, amount }) => ({ kind, amount })), [
    { kind: 'creditTerm', amount: 10_000 },
  ]);
  assert.match(on(events, '2026-12-10')[0].label, /งวดที่ 3/);
});

test('calendar omits receipt events whose actual receipt date is unknown', () => {
  const events = buildCalendarEvents([
    job('undated-partial', {
      received: 4_000, pending: 6_000, status: 'partial', payDate: '2026-10-15',
    }),
    job('undated-installment', {
      received: 10_000, pending: 0, status: 'installment', payDate: '2026-10-20',
      installments: [
        { id: 'legacy-paid', label: 'งวดที่ 1', amount: 10_000, dueDate: '2026-10-01', paidAt: null, status: 'paid' },
      ],
    }),
  ], '2026-10-02');

  assert.equal(Array.from(events.values()).flat().some(event => event.kind === 'paid'), false);
});

test('legacy dueDate records remain visible and mini-calendar priority is deterministic', () => {
  const events = buildCalendarEvents([job('legacy', { payDate: null, dueDate: '2026-10-04' })], '2026-10-02');
  const due = on(events, '2026-10-04')[0];
  assert.deepEqual({ kind: due.kind, amount: due.amount }, { kind: 'dueSoon', amount: 10_000 });

  const primary = primaryCalendarEvent([
    { ...due, id: 'post', kind: 'post' },
    { ...due, id: 'paid', kind: 'paid' },
    { ...due, id: 'overdue', kind: 'overdue' },
  ]);
  assert.equal(primary?.kind, 'overdue');
});
