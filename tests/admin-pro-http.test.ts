import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
Object.assign(process.env,{APP_URL:'http://127.0.0.1:3000',SUPABASE_URL:'https://admin-pro.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test-admin',SESSION_SECRET:'test-secret-'.repeat(5)});
const user={id:'11111111-1111-4111-8111-111111111111',created_at:'2026-01-01T00:00:00Z'};
const target='22222222-2222-4222-8222-222222222222';
const jwt=`e30.${Buffer.from(JSON.stringify({sub:user.id,session_id:target})).toString('base64url')}.test`;
const cookie=`cashflow-session=${seal({access_token:jwt,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,issued_at:Date.now()})}`;
const realFetch=globalThis.fetch;
let server:Server,origin:string,role='admin',result='ok',calls:any[]=[];
before(async()=>{
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!==process.env.SUPABASE_URL)return realFetch(input,init);
  const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  if(url.pathname==='/auth/v1/user')return json(user);
  if(/cashflow_(session_active|rate_limit)$/.test(url.pathname))return json(true);
  if(url.pathname.endsWith('/cashflow_user_roles'))return json({role});
  if(url.pathname.endsWith('/cashflow_admin_pro_action')){calls.push(JSON.parse(String(init?.body)));return json({result});}
  throw new Error('Unexpected '+url.pathname);
 };
 server=await new Promise<Server>(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});
 origin=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{globalThis.fetch=realFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));});
const headers={cookie,'x-account-id':user.id,'x-csrf-protection':'1','content-type':'application/json',origin:process.env.APP_URL!};
const post=(body:any,custom=headers)=>realFetch(origin+'/api/admin-users',{method:'POST',headers:custom,body:JSON.stringify(body)});
test('admin mutation requires current admin, same account, CSRF and explicit allowed operation',async()=>{
 const body={action:'set-pro-access',userId:target,operation:'ban'};
 role='user';assert.equal((await post(body)).status,403);role='admin';
 assert.equal((await post(body,{...headers,'x-account-id':target})).status,401);
 assert.equal((await post(body,{...headers,origin:'https://evil.test'})).status,403);
 for(const b of [{...body,operation:'delete'},{action:'set-pro-access',userId:target,enabled:false},{...body,p_actor:target}])assert.equal((await post(b)).status,400);
 assert.equal(calls.length,0);
});
test('all four actions use the authenticated actor and preserve conflict errors',async()=>{
 for(const operation of ['grant','revoke','ban','unban']){
  result='ok';assert.equal((await post({action:'set-pro-access',userId:target,operation})).status,200);
  assert.deepEqual(calls.at(-1),{p_actor:user.id,p_user_id:target,p_operation:operation});
 }
 for(const blocked of ['banned','checkout_pending','subscription_open','account_closing']){
  result=blocked;assert.equal((await post({action:'set-pro-access',userId:target,operation:'revoke'})).status,409);
 }
});
