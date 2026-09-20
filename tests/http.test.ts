import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal,unseal } from '../backend/src/security/cookies.js';
import Stripe from 'stripe';
import { ensurePrivateReportBucket } from '../backend/src/services/reportStorage.js';
process.env.APP_URL='http://127.0.0.1:3000';process.env.SUPABASE_URL='https://project.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='test-key';process.env.SUPABASE_SERVICE_ROLE_KEY='test-admin';process.env.SESSION_SECRET='test-only-secret-'.repeat(4);process.env.STRIPE_SECRET_KEY='sk_test_only';process.env.STRIPE_WEBHOOK_SECRET='whsec_test';process.env.STRIPE_PRO_PAYMENT_LINK_ID='plink_test';
process.env.LINE_CHANNEL_ID='test-channel';
const user={id:'11111111-1111-4111-8111-111111111111',email:'a@example.com',user_metadata:{role:'admin'}};
const sessionId='33333333-3333-4333-8333-333333333333';
const jwt=`e30.${Buffer.from(JSON.stringify({sub:user.id,session_id:sessionId})).toString('base64url')}.test`;
const expiredJwt=`e30.${Buffer.from(JSON.stringify({sub:user.id,session_id:sessionId,exp:1})).toString('base64url')}.test`;
const cookie=`cashflow-session=${seal({access_token:jwt,refresh_token:'private-refresh',expires_at:Math.floor(Date.now()/1000)+3600,issued_at:Date.now()})}`;
const realFetch=globalThis.fetch;let failure=false;let server:Server;let origin:string;
let failRevocation=false,providerSignoutFails=false,notifyFailure=false;
let signupError={code:'email_address_not_authorized',msg:'private SMTP credentials should never appear'};
let refreshed=0,lineVerifications=0,downloaded=0,bucketUpdates=0;
let currentRole='user', groupError: {code:string;message:string} | null=null;
const groupCalls: {endpoint:string;body:any}[]=[];
const revoked=new Set<string>();
before(async()=>{
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(url==='https://api.line.me/oauth2/v2.1/verify'){lineVerifications++;return json({error:'invalid_token'},401);}
  if(!url.startsWith('https://project.supabase.co/'))return realFetch(input,init);
  if(url.includes('/auth/v1/signup'))return json({...signupError,error_code:signupError.code},422);
  if(url.includes('/auth/v1/token')){refreshed++;return json({access_token:jwt,refresh_token:'private-refresh',expires_in:3600,token_type:'bearer',user});}
  if(url.includes('/auth/v1/user'))return new Headers(init?.headers).get('authorization')===`Bearer ${expiredJwt}`?json({msg:'JWT expired'},401):json(user);
  if(url.includes('/rpc/cashflow_rate_limit'))return json(true);
  if(url.includes('/rpc/cashflow_session_active'))return json(!revoked.has(JSON.parse(String(init?.body)).p_session_id));
  if(url.includes('/cashflow_user_roles'))return json({role:currentRole});
  if(url.includes('/subscriptions'))return json(null);
  if(/\/rpc\/cashflow_group_finance_(snapshot|apply)/.test(url)) {
   const body=JSON.parse(String(init?.body));groupCalls.push({endpoint:url,body});assert.equal(body.p_actor,user.id);
   if(groupError)return json(groupError,groupError.code==='42501'?403:400);
   return json(url.includes('_snapshot')?{snapshot:{expenses:[]},versions:{},workspace:{groupId:body.p_group_id}}:null);
  }
  if(/\/rpc\/cashflow_(groups_snapshot|group_detail|group_mutate|admin_accounts|set_system_role)/.test(url)) {
   const body=JSON.parse(String(init?.body));groupCalls.push({endpoint:url,body});
   assert.equal(body.p_actor,user.id);
   if(groupError)return json(groupError,groupError.code==='42501'?403:400);
   if(url.includes('group_mutate'))return json(body.p_input.groupId);
   if(url.includes('admin_accounts'))return json({users:[],total:0,page:0});
   return json({systemRole:currentRole,groups:[],invitations:[],total:0,page:0});
  }
  if(url.includes('/cashflow_revoked_sessions')){
   if(failRevocation)return json({message:'private revocation DB details',code:'XX000'},500);
   const record=JSON.parse(String(init?.body));assert.equal(record.user_id,user.id);revoked.add(record.session_id);return json(null);
  }
  if(url.includes('/auth/v1/logout'))return providerSignoutFails?json({msg:'JWT expired'},401):new Response(null,{status:204});
  if(url.includes('/cashflow_account_snapshot'))return notifyFailure?json({message:'private notification DB details',code:'XX000'},500):json({notif_settings:{}});
  if(url.includes('/storage/v1/object/authenticated/monthly-reports/')){
   downloaded++;assert.ok(url.endsWith(`/${user.id}/2026-09.xlsx`));assert.equal(new Headers(init?.headers).get('apikey'),'test-admin');assert.equal(init?.redirect,'error');return new Response('test-report-bytes');
  }
  if(url.includes('/storage/v1/bucket/monthly-reports')){
   if(init?.method==='PUT'){bucketUpdates++;const options=JSON.parse(String(init.body));assert.equal(options.public,false);assert.equal(options.file_size_limit,4194304);return json({message:'updated'});}
   return json({id:'monthly-reports',name:'monthly-reports',public:true});
  }
  if(url.includes('/rpc/cashflow_process_payment'))return new Response(failure?JSON.stringify({message:'private DB details',code:'XX000'}):'null',{status:failure?500:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected mock endpoint '+url);
 };
 server=await new Promise<Server>(resolve=>{const instance=createApp().listen(0,'127.0.0.1',()=>resolve(instance));});
 origin=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{globalThis.fetch=realFetch;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
test('HTTP router rejects cross-origin mutations, malformed JSON and unauthenticated data',async()=>{
 const post=await realFetch(origin+'/api/auth',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.com','x-csrf-protection':'1'},body:'{"action":"logout"}'});assert.equal(post.status,403);
 const malformed=await realFetch(origin+'/api/auth',{method:'POST',headers:{'content-type':'application/json',origin:process.env.APP_URL!,'x-csrf-protection':'1'},body:'{'});assert.equal(malformed.status,400);
 const get=await realFetch(origin+'/api/data',{headers:{authorization:`Bearer ${jwt}`}});assert.equal(get.status,401);
 const unknown=await realFetch(origin+'/api/not-found');assert.equal(unknown.status,404);assert.equal(unknown.headers.get('x-content-type-options'),'nosniff');
});
test('cookie-authenticated data rejects wrong owner and invalid amounts before writes',async()=>{
 const get=await realFetch(origin+'/api/data',{headers:{cookie,'x-account-id':'22222222-2222-4222-8222-222222222222'}});assert.equal(get.status,401);
 const post=await realFetch(origin+'/api/data',{method:'POST',headers:{cookie,'x-account-id':user.id,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:JSON.stringify({changes:[{table:'cashflow_expenses',id:'exp',op:'set',version:null,data:{id:'exp',name:'Taxi',amount:-100,category:'Travel',date:'2026-09-17'}}]})});assert.equal(post.status,400);
});
test('group routes require cookie and account binding, reject CSRF and actor injection before mutation',async()=>{
 const id='55555555-5555-4555-8555-555555555555';
 const before=groupCalls.length;
 assert.equal((await realFetch(origin+'/api/groups')).status,401);
 assert.equal((await realFetch(origin+'/api/groups',{headers:{cookie}})).status,401);
 assert.equal((await realFetch(origin+'/api/groups',{headers:{cookie,'x-account-id':id}})).status,401);
 const headers={cookie,'x-account-id':user.id,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'};
 const body={action:'create',groupId:id,name:'Team',description:''};
 assert.equal((await realFetch(origin+'/api/groups',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:JSON.stringify(body)})).status,403);
 assert.equal((await realFetch(origin+'/api/groups',{method:'POST',headers,body:JSON.stringify({...body,actor:id,role:'admin'})})).status,400);
 assert.equal(groupCalls.length,before);
 const created=await realFetch(origin+'/api/groups',{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal(created.status,200);assert.equal((await created.json() as any).groupId,id);
 assert.equal(groupCalls.at(-1)!.body.p_actor,user.id);
 groupError={code:'42501',message:'private permission details'};
 try { const denied=await realFetch(origin+'/api/groups',{method:'POST',headers,body:JSON.stringify({action:'member-role',groupId:id,userId:user.id,role:'leader'})});assert.equal(denied.status,403);assert.ok(!(await denied.text()).includes('private')); }
 finally {groupError=null;}
 groupError={code:'P0001',message:'last_leader'};
 try { assert.equal((await realFetch(origin+'/api/groups',{method:'POST',headers,body:JSON.stringify({action:'leave',groupId:id})})).status,409); }
 finally {groupError=null;}
});
test('admin routes use the current database role and recheck authorization inside RPC',async()=>{
 const headers={cookie,'x-account-id':user.id,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'};
 const before=groupCalls.length;
 assert.equal((await realFetch(origin+'/api/admin-users',{headers})).status,403);
 assert.equal((await realFetch(origin+'/api/admin-users',{method:'POST',headers,body:JSON.stringify({userId:user.id,role:'admin'})})).status,403);
 assert.equal(groupCalls.length,before);
 currentRole='admin';
 try {
  assert.equal((await realFetch(origin+'/api/admin-users',{headers})).status,200);
  assert.equal((await realFetch(origin+'/api/admin-users',{method:'POST',headers,body:JSON.stringify({userId:user.id,role:'user',actor:'spoofed'})})).status,400);
  groupError={code:'42501',message:'forbidden'};
  assert.equal((await realFetch(origin+'/api/admin-users',{method:'POST',headers,body:JSON.stringify({userId:user.id,role:'user'})})).status,403);
 } finally {currentRole='user';groupError=null;}
});
test('finance scope binds the actor to the session and validates group identifiers and privileges',async()=>{
 const group='55555555-5555-4555-8555-555555555555';
 const headers={cookie,'x-account-id':user.id,'x-finance-group':group,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'};
 // Other tests revoke this fixture session; use a fresh fixture session here.
 revoked.delete(sessionId);
 const read=await realFetch(origin+'/api/data',{headers});assert.equal(read.status,200);
 assert.equal(groupCalls.at(-1)!.body.p_group_id,group);
 const before=groupCalls.length;
 assert.equal((await realFetch(origin+'/api/data',{headers:{...headers,'x-finance-group':'not-a-uuid'}})).status,400);
 assert.equal((await realFetch(origin+'/api/data',{headers:{...headers,'x-account-id':group}})).status,401);
 assert.equal(groupCalls.length,before);
 const expense={table:'cashflow_expenses',id:'team-expense',op:'set',version:null,data:{id:'team-expense',name:'Taxi',amount:100,category:'Travel',date:'2026-09-18'}};
 const saved=await realFetch(origin+'/api/data',{method:'POST',headers,body:JSON.stringify({changes:[expense],user_id:group})});assert.equal(saved.status,200);
 assert.equal(groupCalls.at(-1)!.body.p_actor,user.id);
 assert.equal(groupCalls.at(-1)!.body.p_group_id,group);
 groupError={code:'42501',message:'private group details'};
 try {
  for(const method of ['GET','POST']){
   const r=await realFetch(origin+'/api/data',{method,headers,...(method==='POST'?{body:JSON.stringify({changes:[expense]})}:{})});
   assert.equal(r.status,403);assert.ok(!(await r.text()).includes('private group details'));
  }
 }finally{groupError=null;}
 groupError={code:'40001',message:'version_conflict'};
 try {assert.equal((await realFetch(origin+'/api/data',{method:'POST',headers,body:JSON.stringify({changes:[expense]})})).status,409);}
 finally{groupError=null;}
});

test('signup translates provider errors without leaking messages or credentials',async()=>{
 const headers={origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'};
 const cases=[['email_address_not_authorized',503,'ระบบส่งอีเมล'],['over_email_send_rate_limit',429,'อีเมลยืนยันครบจำนวน'],['weak_password',400,'รหัสผ่านไม่ผ่าน'],['unexpected_failure',400,'รหัสอ้างอิง: unexpected_failure']];
 for(const [code,status,message] of cases){
  signupError={code:String(code),msg:'private SMTP credentials should never appear'};
  const r=await realFetch(origin+'/api/auth',{method:'POST',headers,body:JSON.stringify({action:'signup',email:'test@example.com',password:'test-password-123'})});
  assert.equal(r.status,status);const body=await r.text();assert.ok(body.includes(String(message)));assert.ok(!body.includes('private SMTP'));
 }
});
test('Stripe verifies raw bytes, returns 500 on DB failures and does not leak DB details',async()=>{
 const raw=JSON.stringify({id:'evt_test',object:'event',created:Math.floor(Date.now()/1000),type:'checkout.session.completed',data:{object:{id:'cs_test',object:'checkout.session',created:Math.floor(Date.now()/1000),payment_link:'plink_test',mode:'payment',currency:'thb',amount_total:14900,payment_status:'paid',client_reference_id:user.id,payment_intent:'pi_test'}}});
 const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_test'});
 const request=()=>realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:raw});
 failure=true;const failed=await request();assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes('private DB'));
 failure=false;assert.equal((await request()).status,200);
 const tampered=await realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':signature},body:raw+' '});assert.equal(tampered.status,400);
});

test('OAuth stores PKCE only, exchanges code server-side, and never returns tokens to the browser',async()=>{
 const begin=await realFetch(origin+'/api/auth',{method:'POST',headers:{origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:'{"action":"oauth"}'});
 assert.equal(begin.status,200);
 const body=await begin.json() as any;assert.ok(body.url.includes('code_challenge='));assert.equal(body.access_token,undefined);
 const oauth=begin.headers.getSetCookie().find(value=>value.startsWith('cashflow-oauth='))!.split(';')[0];
 const verifier=unseal<any>(oauth.slice(oauth.indexOf('=')+1));assert.equal(Object.keys(verifier.storage).length,1);assert.ok(Object.keys(verifier.storage)[0].endsWith('-code-verifier'));
 assert.ok(!JSON.stringify(verifier).includes('access_token'));
 const callback=await realFetch(origin+'/api/auth?code=fake-code',{headers:{cookie:oauth},redirect:'manual'});
 assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),process.env.APP_URL+'/app');
 assert.ok(callback.headers.getSetCookie().some(value=>value.startsWith('cashflow-session=')&&value.includes('HttpOnly')));
 const session=await realFetch(origin+'/api/auth',{headers:{cookie,'x-account-id':'old-account'}});
 assert.equal(session.status,200);const publicData=await session.json() as any;assert.equal(publicData.session.user.id,user.id);assert.equal(publicData.session.user.role,'user');assert.equal(publicData.session.user.user_metadata.role,undefined);assert.equal(publicData.session.access_token,undefined);
});

test('expired-token logout revokes the original session and rejects copied-cookie replay before refreshing',async()=>{
 revoked.clear();providerSignoutFails=true;
 const expiredCookie=`cashflow-session=${seal({access_token:expiredJwt,refresh_token:'private-refresh',expires_at:1,issued_at:Date.now()-3600000})}`;
 try {
  const logout=await realFetch(origin+'/api/auth',{method:'POST',headers:{cookie:expiredCookie,'x-account-id':user.id,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:'{"action":"logout"}'});
  assert.equal(logout.status,200);assert.ok(revoked.has(sessionId));assert.ok(logout.headers.getSetCookie().some(value=>value.startsWith('cashflow-session=;')&&value.includes('Max-Age=0')));
  const before=refreshed;
  const replay=await realFetch(origin+'/api/auth',{headers:{cookie:expiredCookie}});
  assert.deepEqual(await replay.json(),{session:null});assert.equal(refreshed,before);
 }finally{providerSignoutFails=false;revoked.clear();}
});
test('logout fails closed on revocation DB failure and cannot revoke a different account',async()=>{
 failRevocation=true;
 try {
  const logout=await realFetch(origin+'/api/auth',{method:'POST',headers:{cookie,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:'{"action":"logout"}'});
  assert.equal(logout.status,500);assert.ok(!(await logout.text()).includes('private'));assert.ok(!logout.headers.getSetCookie().some(value=>value.includes('Max-Age=0')));
 }finally{failRevocation=false;}
 const wrongOwner=await realFetch(origin+'/api/auth',{method:'POST',headers:{cookie,'x-account-id':'22222222-2222-4222-8222-222222222222',origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:'{"action":"logout"}'});
 assert.equal(wrongOwner.status,401);assert.equal(revoked.size,0);
});
test('refresh preserves the absolute lifetime and an eight-hour session is revoked',async()=>{
 const issuedAt=Date.now()-3600000;
 const expiredCookie=`cashflow-session=${seal({access_token:expiredJwt,refresh_token:'private-refresh',expires_at:1,issued_at:issuedAt})}`;
 const refreshedSession=await realFetch(origin+'/api/auth',{headers:{cookie:expiredCookie}});
 assert.equal((await refreshedSession.json() as any).session.user.id,user.id);
 const renewedCookie=refreshedSession.headers.getSetCookie().find(value=>value.startsWith('cashflow-session='))!.split(';')[0];
 assert.equal(unseal<any>(renewedCookie.slice(renewedCookie.indexOf('=')+1)).issued_at,issuedAt);
 const tooOld=`cashflow-session=${seal({access_token:jwt,refresh_token:'private-refresh',expires_at:Math.floor(Date.now()/1000)+3600,issued_at:Date.now()-9*3600000})}`;
 try { const expired=await realFetch(origin+'/api/auth',{headers:{cookie:tooOld}});assert.deepEqual(await expired.json(),{session:null});assert.ok(revoked.has(sessionId)); }
 finally{revoked.clear();}
});
test('reports require login, reject other owners and arbitrary URLs, and download only the authenticated owner path',async()=>{
 const anonymous=await realFetch(origin+'/api/download-report?month=2026-09&account='+user.id,{redirect:'manual'});
 assert.equal(anonymous.status,302);assert.ok(anonymous.headers.get('location')?.includes('/app?report=2026-09'));
 const before=downloaded;
 const wrong=await realFetch(origin+'/api/download-report?month=2026-09&account=22222222-2222-4222-8222-222222222222',{headers:{cookie}});assert.equal(wrong.status,403);
 const arbitrary=await realFetch(origin+'/api/download-report?u=https://evil.com',{headers:{cookie}});assert.equal(arbitrary.status,400);
 assert.equal(downloaded,before);
 const owned=await realFetch(origin+'/api/download-report?month=2026-09&account='+user.id,{headers:{cookie}});assert.equal(owned.status,200);assert.equal(await owned.text(),'test-report-bytes');assert.equal(owned.headers.get('cache-control'),'no-store');
});
test('existing public report buckets are explicitly converted to private with size limits',async()=>{
 await ensurePrivateReportBucket();assert.equal(bucketUpdates,1);
});
test('notification failures never expose internal DB errors',async()=>{
 notifyFailure=true;
 try {
  const response=await realFetch(origin+'/api/notify',{method:'POST',headers:{cookie,'x-account-id':user.id,origin:process.env.APP_URL!,'x-csrf-protection':'1','content-type':'application/json'},body:'{"event":"record-added"}'});
  assert.equal(response.status,500);assert.ok(!(await response.text()).includes('private notification'));
 }finally{notifyFailure=false;}
});
test('LIFF flooding is rejected before provider verification even with changing spoofed IP headers',async()=>{
 const before=lineVerifications;
 const responses=[];
 for(let i=0;i<25;i++)responses.push(await realFetch(origin+'/api/liff-submit',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':`198.51.100.${i}`,'x-vercel-forwarded-for':`203.0.113.${i}`},body:'{"idToken":"invalid-audit-token"}'}));
 assert.equal(lineVerifications-before,20);assert.equal(responses.filter(response=>response.status===429).length,5);assert.equal(responses.at(-1)!.headers.get('retry-after'),'60');
});
