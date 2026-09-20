import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal,unseal,writeCookie } from '../backend/src/security/cookies.js';
import { assertSameOrigin,readRawBody } from '../backend/src/http/guard.js';
import { reportMonth } from '../backend/src/handlers/download-report.js';
import { appOrigin } from '../backend/src/config/env.js';
import { RequestLimiter, clientIp } from '../backend/src/security/ingress.js';
import { diffSnapshot,commitChanges,type Baseline } from '../shared/changes.js';
import { validateChanges,notificationPreferences } from '../shared/validation.js';
import { Readable } from 'node:stream';
process.env.APP_URL='https://cash.example.com';process.env.SESSION_SECRET='test-key-only-'.repeat(4);
test('session encryption rejects tampering and cookie flags prevent JS token access',()=>{
 const value={access_token:'private-access',refresh_token:'private-refresh'};const encrypted=seal(value);
 assert.ok(!encrypted.includes(value.access_token));assert.deepEqual(unseal(encrypted),value);
 const tampered=Buffer.from(encrypted,'base64url');tampered[20]^=1;assert.equal(unseal(tampered.toString('base64url')),null);
 const headers:Record<string,any>={};writeCookie({getHeader:(k:string)=>headers[k],setHeader:(k:string,v:any)=>{headers[k]=v;}} as any,value);
 assert.match(headers['Set-Cookie'][0],/^__Host-cashflow-session=/);assert.match(headers['Set-Cookie'][0],/HttpOnly; SameSite=Lax/);assert.match(headers['Set-Cookie'][0],/; Secure/);
});
test('CSRF rejects foreign, missing and spoofed suffix origins',()=>{
 const valid={'origin':'https://cash.example.com','x-csrf-protection':'1'};assert.doesNotThrow(()=>assertSameOrigin({headers:valid} as any));
 for(const origin of ['https://evil.com','https://cash.example.com.evil.com',undefined])assert.throws(()=>assertSameOrigin({headers:{...valid,origin}} as any));
 assert.throws(()=>assertSameOrigin({headers:{origin:valid.origin}} as any));
});
test('report references accept months only, excluding paths, arrays and URLs',()=>{
 assert.equal(reportMonth('2026-09'),'2026-09');
 for(const bad of ['2026-00','2026-13','../other','https://evil.com','2026-09/../../a',undefined,['2026-09']])assert.throws(()=>reportMonth(bad));
});
test('production rejects HTTP and credential-bearing origins while development allows localhost',()=>{
 const previous={url:process.env.APP_URL,mode:process.env.NODE_ENV};
 try {
  process.env.NODE_ENV='production';process.env.APP_URL='http://127.0.0.1:3000';assert.throws(appOrigin,/HTTPS/);
  process.env.APP_URL='https://user:pass@cash.example.com';assert.throws(appOrigin,/Invalid/);
  process.env.APP_URL='https://cash.example.com/app';assert.equal(appOrigin(),'https://cash.example.com');
  process.env.NODE_ENV='development';process.env.APP_URL='http://127.0.0.1:3000';assert.equal(appOrigin(),process.env.APP_URL);
 } finally { process.env.APP_URL=previous.url;if(previous.mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.mode; }
});
test('ingress counters enforce limits, expire and cap memory without evicting active clients',()=>{
 let now=0;const limiter=new RequestLimiter(2,()=>now);
 limiter.take('a',2,60);limiter.take('a',2,60);assert.throws(()=>limiter.take('a',2,60),/บ่อย/);
 limiter.take('b',1,60);assert.throws(()=>limiter.take('c',1,60),/บ่อย/);
 now=60000;assert.doesNotThrow(()=>limiter.take('c',1,60));assert.doesNotThrow(()=>limiter.take('a',2,60));
});
test('client IP ignores spoofed forwarding headers outside Vercel',()=>{
 const previous=process.env.VERCEL;
 try {
  delete process.env.VERCEL;
  const req={headers:{'x-forwarded-for':'198.51.100.1','x-vercel-forwarded-for':'198.51.100.2'},socket:{remoteAddress:'::ffff:127.0.0.1'}} as any;
  assert.equal(clientIp(req),'127.0.0.1');process.env.VERCEL='1';assert.equal(clientIp(req),'198.51.100.2');
  req.headers['x-vercel-forwarded-for']='invalid';assert.equal(clientIp(req),'127.0.0.1');
 }finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
test('diffs preserve records added by other channels and deletion requires loaded versions',()=>{
 const baseline:Baseline={cashflow_jobs:{a:{data:{id:'a',name:'before'},version:4}}};
 const changes=diffSnapshot(baseline,{jobs:[{id:'a',name:'after'}]});assert.equal(changes.length,1);assert.equal(changes[0].version,4);
 assert.ok(!changes.some(c=>c.id==='external-line-job'));
 commitChanges(baseline,changes);assert.equal(baseline.cashflow_jobs.a.version,5);
 assert.deepEqual(diffSnapshot(baseline,{jobs:[]}),[{table:'cashflow_jobs',id:'a',op:'delete',version:5}]);
});
test('validation rejects negative/non-finite amounts, mismatched IDs and private-state injection',()=>{
 const expense={id:'expense',name:'Taxi',category:'Travel',amount:10,date:'2026-09-17'};
 const change={table:'cashflow_expenses',id:'expense',op:'set',version:null,data:expense};assert.equal(validateChanges([change]).length,1);
 for(const amount of [-1,NaN,Infinity])assert.throws(()=>validateChanges([{...change,data:{...expense,amount}}]));
 assert.throws(()=>validateChanges([{...change,id:'other'}]));assert.throws(()=>validateChanges([{...change,table:'subscriptions'}]));
 const prefs=notificationPreferences.parse({enabled:true,lineUserId:'attacker',passwordResetCode:{code:'123456'},pendingJobDraft:{}});
 assert.deepEqual(prefs,{enabled:true});
});
test('raw webhook reader preserves bytes and rejects oversized requests',async()=>{
 const raw=Buffer.from('{ "a": 1 }');assert.deepEqual(await readRawBody(Readable.from([raw]) as any),raw);
 await assert.rejects(readRawBody(Readable.from([Buffer.alloc(100)]) as any,10),/too large/);
});
