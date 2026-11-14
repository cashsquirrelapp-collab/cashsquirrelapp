import { z } from 'zod';
import { isValidWhtRate } from './wht.js';
import { onboardingRecordSchema } from './onboarding.js';
import { businessProfileSchema } from './businessProfile.js';
export const entityTables = ['cashflow_jobs','cashflow_expenses','cashflow_goals','cashflow_invoices','cashflow_documents'] as const;
const id=z.string().min(1).max(128).refine(value=>!['__proto__','prototype','constructor'].includes(value));
const money=z.number().finite().min(0).max(1_000_000_000_000);
const text=z.string().max(10000);
export const notificationPreferences=z.object({
 enabled:z.boolean().optional(), alertEmail:z.union([z.email().max(254),z.literal('')]).optional(),
 serviceType:z.enum(['mailto','emailjs']).optional(),emailjsServiceId:text.optional(),emailjsTemplateId:text.optional(),emailjsPublicKey:text.optional(),
 pendingQueue:z.array(z.object({id,jobId:id,jobName:text,client:text,pendingAmount:money,dueDate:text,detectedDate:text,status:z.enum(['pending','sent','skipped']),sentDate:text.optional()})).max(10000).optional(),
 dailyDigestEnabled:z.boolean().optional(),monthlyReportEnabled:z.boolean().optional(),wht50ReminderEnabled:z.boolean().optional()
});
// The person's own account from a slip (bank code + last four digits only) and the slip's reference (shared/slipAccounts.ts).
const slipAccount=z.object({bank:z.string().regex(/^[A-Z ]{2,8}$/),last4:z.string().regex(/^\d{4}$/)}).strict();
const slipRef=z.string().regex(/^[A-Z0-9]{6,40}$/);
const installment=z.object({id:text,label:z.string().min(1).max(100),amount:money,dueDate:z.string().nullable(),paidAt:z.string().nullable(),status:z.enum(['pending','paid'])});
const job=z.object({id,name:z.string().min(1).max(500),value:money,received:money,pending:money,client:text,type:text,status:text,creditTerm:z.number().int().min(0).max(3650),note:text,payDate:z.string().nullable(),hoursSpent:money.optional(),whtRate:z.number().min(0).max(100).refine(isValidWhtRate,'WHT rate allows at most 2 decimals').optional(),whtAmount:money.optional(),followUpCount:z.number().int().min(0).optional(),depositDate:z.string().max(10).nullable().optional(),depositAmount:money.optional(),remindAt:z.string().max(10).nullable().optional(),installments:z.array(installment).max(100).optional(),wht50NotNeeded:z.boolean().optional(),account:slipAccount.optional(),slipRefs:z.array(slipRef).max(200).optional()}).passthrough();
const expense=z.object({id,name:z.string().min(1).max(500),amount:money,category:text,date:text,note:text.optional(),account:slipAccount.optional(),slipRef:slipRef.optional()}).passthrough();
const goal=z.object({id,name:z.string().min(1).max(500),target:money,current:money,history:z.array(z.object({id,type:z.enum(['deposit','withdraw']),amount:money,date:text,reason:text}).passthrough()).max(10000).optional()}).passthrough();
const profile=z.object({name:text,address:text,phone:text,email:text,taxId:text,bankName:text,bankAccount:text,bankAccountName:text,logoUrl:z.string().max(500000).optional(),signatureUrl:z.string().max(500000).optional(),logoHeight:z.number().min(20).max(300).optional(),logoPosition:z.enum(['left','center','right','custom']).optional(),logoOffset:z.number().min(0).max(100).optional(),website:text.optional()});
const invoice=z.object({id,documentType:z.enum(['invoice','receipt','quotation','taxInvoice','receiptTaxInvoice']),documentNo:text,createdDate:text,issuer:profile,client:z.object({name:text,address:text,phone:text,email:text,taxId:text,contactName:text.optional(),code:text.optional(),branch:text.optional()}),items:z.array(z.object({id,description:text,quantity:money,price:money,discount:money.optional(),unit:text.optional(),detail:text.optional()})).max(1000),vatRate:z.number().min(0).max(100),whtRate:z.number().min(0).max(100)}).passthrough();
const settings=z.object({monthlyExpense:money,monthlyRevenueGoal:money,savingsPercentage:z.number().min(0).max(100),fixedExpenseItems:z.array(z.object({id,name:text,amount:money})).max(1000).optional(),cashOpening:z.object({amount:z.number().finite().min(-1e12).max(1e12),createdAt:z.string().max(40),updatedAt:z.string().max(40)}).strict().optional(),onboarding:onboardingRecordSchema.optional(),business:businessProfileSchema.optional(),filed:z.record(z.string().regex(/^[a-z0-9]+:\d{4}(-\d{2})?$/),z.string().max(40)).refine(value=>Object.keys(value).length<=400,'too many').optional(),accountNames:z.record(z.string().regex(/^[A-Z ]{2,8}:\d{4}$/),z.string().max(40)).refine(value=>Object.keys(value).length<=50,'too many').optional()}).passthrough();
const documentSchemas:Record<string,z.ZodType>={
 settings,statuses:z.array(z.object({id,label:text,behavior:z.enum(['done','partial','pending'])})).max(1000),job_types:z.array(z.string().max(500)).max(1000),
 notif_settings:notificationPreferences,avatar_data_url:z.union([z.literal(''),z.string().max(500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),z.null()]),issuer_profile:profile
};
export const changeSchema=z.object({table:z.enum(entityTables),id,op:z.enum(['set','delete']),version:z.number().int().positive().nullable(),data:z.unknown().optional()});
export type Change=z.infer<typeof changeSchema>;
export function validateChanges(input:unknown):Change[] {
 assertSafeJson(input);
 const changes=z.array(changeSchema).max(10000).parse(input); const seen=new Set<string>();
 return changes.map(c=>{
  const key=`${c.table}:${c.id}`; if(seen.has(key)) throw new Error('Duplicate mutation'); seen.add(key);
  if(c.op==='delete') { if(c.version===null) throw new Error('Delete requires version'); return c; }
  const schema=c.table==='cashflow_documents'?documentSchemas[c.id]:({cashflow_jobs:job,cashflow_expenses:expense,cashflow_goals:goal,cashflow_invoices:invoice}[c.table]);
  if(!schema) throw new Error('Invalid document'); const data=schema.parse(c.data);
  if(c.table!=='cashflow_documents'&&(data as any).id!==c.id) throw new Error('ID mismatch');
  // A new job must be worth more than 0 (6b8e474). Jobs saved before that rule may be worth 0; they can still be
  // saved (marked paid, moved, edited) or every later save from the app would be refused with them.
  if(c.table==='cashflow_jobs'&&c.version===null&&!((data as any).value>=0.01)) throw new Error('A new job needs a value above 0');
  return {...c,data};
 });
}

function assertSafeJson(value:unknown,depth=0):void {
 if(depth>30)throw new Error('Nested data is too deep');
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Invalid number');
 if(Array.isArray(value)){for(const item of value)assertSafeJson(item,depth+1);}
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)) {
  if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsafe object key');
  assertSafeJson(item,depth+1);
 }
}
