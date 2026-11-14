import { z } from 'zod';
import { SLIP_BANKS, accountLabel, slipAccountOf, slipAlreadyRecorded, slipRefOf, type SlipAccount } from '../../../shared/slipAccounts.js';

// What a transfer slip tells a proposal (owner, 2026-11-14, item 3 of the plan): the person's own account (bank + last
// four digits, never more) and the slip's reference number. The card shows the account, and says so when the same slip
// was already recorded, before anything is saved again; the person still decides (the save is not blocked).

/** The `slip` argument of the proposals made from a slip (expense, payment, new job, job edit). */
export const slipArgSchema = z.object({
  bank: z.enum(SLIP_BANKS).optional().describe('Bank of the USER\'S OWN account on the slip (the sender for money out, the receiver for money in)'),
  account_last4: z.string().max(8).optional().describe('The last 4 visible digits of that own account, exactly 4 digits; never more'),
  reference: z.string().max(60).optional().describe('The slip\'s reference / transaction number (เลขที่รายการ, รหัสอ้างอิง, Ref)'),
}).strict().describe('From a transfer slip only: what it shows of the user\'s own account and its reference number. Leave out what is not visible.');

/** The same, as the JSON Schema the chat tools declare (tools.ts). */
export const SLIP_PARAMETER = {
  type: 'object',
  description: 'From a transfer slip only: what it shows of the user\'s own account and its reference number. Leave out what is not visible.',
  properties: {
    bank: { type: 'string', enum: [...SLIP_BANKS], description: 'Bank of the USER\'S OWN account on the slip (the receiver for money in)' },
    account_last4: { type: 'string', description: 'The last 4 visible digits of that own account, exactly 4 digits; never more' },
    reference: { type: 'string', description: 'The slip\'s reference / transaction number (เลขที่รายการ, รหัสอ้างอิง, Ref)' },
  },
} as const;

export type SlipFacts = { account: SlipAccount | null; ref: string | null };

export function slipFacts(raw: unknown): SlipFacts {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return { account: slipAccountOf(value.bank, value.account_last4), ref: slipRefOf(value.reference) };
}

type Rows = { label: string; value: string }[];
type Records = { id?: string; name?: unknown; account?: unknown; slipRef?: unknown; slipRefs?: unknown }[];

/** The card lines a slip adds, and the record it repeats (if any). `except`: the record being changed itself. */
export function slipCard(facts: SlipFacts, context: { accountNames?: Record<string, string> | null; expenses?: Records; jobs?: Records; except?: string }) {
  const duplicate = slipAlreadyRecorded(facts.ref, context.expenses ?? [], context.jobs ?? [], context.except);
  const first: Rows = duplicate ? [{ label: 'สลิปซ้ำ', value: `สลิปนี้บันทึกไว้แล้วใน${duplicate.kind === 'job' ? 'งาน' : 'รายจ่าย'} “${duplicate.name}” ตรวจก่อนยืนยัน` }] : [];
  const last: Rows = facts.account ? [{ label: 'บัญชี', value: accountLabel(facts.account, context.accountNames) }] : [];
  return { first, last, duplicate };
}

/** What the model is told when the slip was recorded before, so it says so in its answer. */
export const duplicateNote = (duplicate: { kind: 'expense' | 'job'; name: string }) => ({
  duplicate_slip: { recorded_as: duplicate.kind, name: duplicate.name },
  note: `This slip (same reference number) was already recorded as the ${duplicate.kind} "${duplicate.name}". Tell the user plainly before they confirm; the card says it too.`,
});
