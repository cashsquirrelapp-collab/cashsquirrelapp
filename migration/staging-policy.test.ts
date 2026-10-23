import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationReady, allowedCoreRequest, STAGING_ORIGIN, STAGING_DATABASE } from './staging-policy.js';
import { cloudflareClientIp, withCloudflareClientIp } from '../backend/src/security/requestContext.js';
const config={STAGING_MODE:'integrated', APP_URL:STAGING_ORIGIN, SUPABASE_URL:STAGING_DATABASE, STRIPE_MODE:'test', SESSION_SECRET:'synthetic-session-secret-at-least-32-characters', SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key', SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key'};
test('rejects production, substituted hosts, missing secrets and outbound provider configuration',()=>{
 assert.equal(configurationReady(config),true);
 for(const patch of [{SUPABASE_URL:'https://rcllghixkclvkxhvttaw.supabase.co'},{SUPABASE_URL:STAGING_DATABASE+'.evil.invalid'},{APP_URL:'https://kraroktunngern.vercel.app'},{SESSION_SECRET:''},{SUPABASE_SERVICE_ROLE_KEY:undefined},{STRIPE_MODE:'live'},{STRIPE_SECRET_KEY:'sk_live_synthetic'},{GMAIL_USER:'test@example.invalid'},{LINE_CHANNEL_ACCESS_TOKEN:'synthetic'},{CRON_SECRET:'synthetic'}]) assert.equal(configurationReady({...config,...patch}),false);
});
test('allows core operations and blocks webhook/cron/OAuth/signup/encoded route bypasses',async()=>{
 for(const path of ['/api/data','/api/vault','/api/profile','/api/auth']) assert.equal(await allowedCoreRequest(new Request(STAGING_ORIGIN+path)),true);
 for(const path of ['/api/send-monthly-report','/api/stripe-webhook','/api/line-webhook','/api/setup-line-richmenu','/api/account','/api/auth?code=synthetic','/api/%61uth','/api/auth/','/api/admin-users']) assert.equal(await allowedCoreRequest(new Request(STAGING_ORIGIN+path)),false);
 for(const action of ['signin','logout','signup','oauth','unlock-request','unlock-verify']) {
  const req=new Request(STAGING_ORIGIN+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
  assert.equal(await allowedCoreRequest(req),['signin','logout'].includes(action));
  assert.equal((await req.json()).action,action,'inspection must preserve original request body');
 }
 assert.equal(await allowedCoreRequest(new Request(STAGING_ORIGIN+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(16385)})),false);
});
test('client address cannot be supplied by arbitrary proxy headers and stays isolated concurrently',async()=>{
 const spoofed=new Request(STAGING_ORIGIN,{headers:{'CF-Connecting-IP':'203.0.113.99','x-forwarded-for':'203.0.113.98'}});
 assert.equal(withCloudflareClientIp(spoofed,()=>cloudflareClientIp()),'unknown');
 const requests=['203.0.113.1','2001:db8::1'].map(ip=>Object.assign(new Request(STAGING_ORIGIN,{headers:{'CF-Connecting-IP':ip}}),{cf:{colo:'test'}}));
 const values=await Promise.all(requests.map((req,i)=>withCloudflareClientIp(req,async()=>{await new Promise(r=>setTimeout(r,10-i));return cloudflareClientIp();})));
 assert.deepEqual(values,['203.0.113.1','2001:db8::1']);assert.equal(cloudflareClientIp(),undefined);
});
