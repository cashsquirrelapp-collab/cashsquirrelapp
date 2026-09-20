import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { required } from '../config/env.js';
import { withGuard,readRawBody,HttpError } from '../http/guard.js';
export const config={api:{bodyParser:false}};
export default withGuard(async(req,res)=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const signature=req.headers['stripe-signature'];if(typeof signature!=='string')throw new HttpError(400,'Missing signature');
 let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await readRawBody(req),signature,required('STRIPE_WEBHOOK_SECRET'));}catch{throw new HttpError(400,'Invalid webhook signature');}
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded'].includes(event.type)){res.json({received:true});return;}
 let session:Stripe.Checkout.Session; let refund=false;
 if(event.type==='charge.refunded') {
  const charge=event.data.object as Stripe.Charge;
  // A partial refund does not cancel a full month's entitlement.
  if(!charge.refunded){res.json({received:true});return;}
  const paymentIntent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
  if(!paymentIntent)throw new HttpError(400,'Missing payment reference');
  const sessions=await stripe.checkout.sessions.list({payment_intent:paymentIntent,limit:1});session=sessions.data[0];refund=true;
 }else session=event.data.object as Stripe.Checkout.Session;
 const paymentLink=typeof session?.payment_link==='string'?session.payment_link:session?.payment_link?.id;
 if(!session || paymentLink!==required('STRIPE_PRO_PAYMENT_LINK_ID') || session.mode!=='payment' || session.currency!=='thb' || session.amount_total!==14900){res.json({received:true,ignored:true});return;}
 if(!refund && session.payment_status!=='paid'){res.json({received:true});return;}
 if(!session.client_reference_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.client_reference_id))throw new HttpError(400,'Invalid account reference');
 const paymentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(!paymentId)throw new HttpError(400,'Missing payment reference');
 const saved=await getSupabaseAdmin().rpc('cashflow_process_payment',{p_event_id:event.id,p_payment_id:paymentId,p_user_id:session.client_reference_id,p_amount:session.amount_total,p_currency:session.currency,p_paid_at:new Date(session.created*1000).toISOString(),p_refund:refund});
 if(saved.error)throw saved.error;res.json({received:true});
});
