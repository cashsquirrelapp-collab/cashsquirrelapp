// Read-only Stripe export. Generates reviewable SQL; never writes to a database.
import dotenv from 'dotenv';
import { mkdir,writeFile } from 'node:fs/promises';
import { getStripe } from '../src/config/stripe.js';
import { required } from '../src/config/env.js';
import { z } from 'zod';
dotenv.config({path:['.env.local','.env']});
const stripe=getStripe();const paymentLink=required('STRIPE_PRO_PAYMENT_LINK_ID');
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const lines=['-- Generated from Stripe. Review before applying.','begin;'];
for await(const session of stripe.checkout.sessions.list({limit:100,created:{gte:Math.floor(Date.now()/1000)-45*86400}})) {
 const link=typeof session.payment_link==='string'?session.payment_link:session.payment_link?.id;
 if(link!==paymentLink||session.payment_status!=='paid'||session.mode!=='payment'||session.currency!=='thb'||session.amount_total!==14900||!z.uuid().safeParse(session.client_reference_id).success)continue;
 const payment=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;if(!payment)continue;
 const charges=await stripe.charges.list({payment_intent:payment,limit:1});
 const refunded=charges.data[0]?.refunded===true;
 lines.push(`select public.cashflow_process_payment(${quote(`backfill:${session.id}`)},${quote(payment)},${quote(session.client_reference_id!)},14900,'thb',${quote(new Date(session.created*1000).toISOString())},${refunded});`);
}
lines.push('commit;');await mkdir('database/generated',{recursive:true});
await writeFile('database/generated/stripe-backfill.sql',lines.join('\n')+'\n',{mode:0o600});
console.log('Generated database/generated/stripe-backfill.sql; review it before applying.');
