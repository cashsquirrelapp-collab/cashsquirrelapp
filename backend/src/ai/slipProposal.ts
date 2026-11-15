import { z } from 'zod';
import { SLIP_BANKS, accountLabel, bankFromText, slipAccountOf, slipAlreadyRecorded, slipRefOf, type SlipAccount } from '../../../shared/slipAccounts.js';

// What a transfer slip tells a proposal (owner, 2026-11-14, item 3 of the plan): the person's own account (bank + last
// four digits, never more) and the slip's reference number. The card shows the account, and says so when the same slip
// was already recorded, before anything is saved again; the person still decides (the save is not blocked).
// Which bank, for sure (owner, 2026-11-15: "มึงแน่ใจ for sure นะว่าอันไหนของธนาคารไหน เอาทั้งหมดของประเทศไทยที่มีเลยนะ"): the
// model copies the bank's name as printed on the person's side of the slip (bank_text) and says which side that is
// (own_side); the bank comes from the printed name through a fixed table (shared/slipAccounts.ts bankFromText), never from
// the model's own pick. The account is kept only when the name is one the table knows, the side matches the direction
// (the sender for money out, the receiver for money in), and the model's pick, if it gave one, is the same bank.
// Anything less: no account on the record (the reference is still kept), never a guess.

/** The `slip` argument of the proposals made from a slip (expense, payment, new job, job edit). */
export const slipArgSchema = z.object({
  own_side: z.enum(['sender', 'receiver']).optional().describe('Which side of the slip is the USER\'S OWN account: sender (money out) or receiver (money in)'),
  bank_text: z.string().max(80).optional().describe('The bank or wallet name printed on that own side, copied exactly as printed (Thai or English; letters in its logo count). Empty when nothing printed names it'),
  bank: z.enum(SLIP_BANKS).optional().describe('Bank of the USER\'S OWN account on the slip (the sender for money out, the receiver for money in)'),
  account_last4: z.string().max(8).optional().describe('The last 4 visible digits of that own account, exactly 4 digits; never more'),
  reference: z.string().max(60).optional().describe('The slip\'s reference / transaction number (เลขที่รายการ, รหัสอ้างอิง, Ref)'),
}).strict().describe('From a transfer slip only: what it shows of the user\'s own account and its reference number. Leave out what is not visible.');

/** The same, as the JSON Schema the chat tools declare (tools.ts). */
export const SLIP_PARAMETER = {
  type: 'object',
  description: 'From a transfer slip only: what it shows of the user\'s own account and its reference number. Leave out what is not visible.',
  properties: {
    own_side: { type: 'string', enum: ['sender', 'receiver'], description: 'Which side of the slip is the USER\'S OWN account: sender (money out) or receiver (money in)' },
    bank_text: { type: 'string', description: 'The bank or wallet name printed on that own side, copied exactly as printed (Thai or English; letters in its logo count). Leave out when nothing printed names it' },
    bank: { type: 'string', enum: [...SLIP_BANKS], description: 'Bank of the USER\'S OWN account on the slip (the receiver for money in)' },
    account_last4: { type: 'string', description: 'The last 4 visible digits of that own account, exactly 4 digits; never more' },
    reference: { type: 'string', description: 'The slip\'s reference / transaction number (เลขที่รายการ, รหัสอ้างอิง, Ref)' },
  },
} as const;

export type SlipFacts = { account: SlipAccount | null; ref: string | null };

/** `direction`: 'out' for an expense (the person paid), 'in' for money received (a job, a payment). */
export function slipFacts(raw: unknown, direction: 'out' | 'in'): SlipFacts {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const bank = bankFromText(value.bank_text);
  const side = direction === 'out' ? 'sender' : 'receiver';
  const sure = !!bank && value.own_side === side && (value.bank === undefined || value.bank === bank);
  return { account: sure ? slipAccountOf(bank, value.account_last4) : null, ref: slipRefOf(value.reference) };
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
