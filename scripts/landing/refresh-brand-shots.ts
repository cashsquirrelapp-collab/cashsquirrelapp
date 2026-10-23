// Refresh public screenshots using fixture data only; no real accounts or payments.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from './sampleData';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:3199';
const browser = await chromium.launch();
const ROOT = path.resolve(import.meta.dirname, '../..');
const proof = path.join(ROOT, 'artifacts/logo01'); fs.mkdirSync(proof,{recursive:true});
async function open(width:number,height:number,dpr=1,dark=false,loggedIn=true) {
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,locale:'th-TH',timezoneId:'Asia/Bangkok',colorScheme:dark?'dark':'light',isMobile:width<600,hasTouch:width<600});
 const page=await ctx.newPage(); await page.clock.setFixedTime(new Date(CAPTURE_NOW));
 await page.addInitScript(({email,dark})=>{
 const day=new Date().toISOString().split('T')[0];localStorage.setItem('cashflow_dark_mode',String(dark));
 localStorage.setItem(`cashflow_promo_last_shown_${email}`,day);
 localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`,String(Date.now()));
 sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`,'1');
 },{email:sampleUser.email,dark});
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: SUBSCRIPTION.free } }) : r.fulfill({ json: { ok: true } }));

 if(!loggedIn) await page.route('**/api/auth',r=>r.fulfill({json:{session:null}}));
 return {page,ctx,errors,dark};
}
async function capture(s:any,route:string,name:string,target?:string){
 await s.page.goto(BASE+route,{waitUntil:'networkidle'});
 await s.page.evaluate(()=>document.fonts.ready); await s.page.waitForTimeout(700);
 if(s.dark && !await s.page.locator('html').evaluate(el=>el.classList.contains('dark'))) { await s.page.getByRole('button',{name:'เปลี่ยนเป็นโหมดมืด',exact:true}).click(); await s.page.waitForTimeout(200); }
 const visible=s.page.locator('.krarok-brand-lockup:visible, .ksm-brand:visible');
 if(!await visible.count()) throw new Error('No visible new logo on '+route);
 if(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw new Error('Horizontal overflow '+route);
 const png=path.join(proof,name+'.png'); await s.page.screenshot({path:png});
 if(target) execFileSync('cwebp',['-quiet','-q','90',png,'-o',path.join(ROOT,'frontend/public',target)]);
 console.log(name, 'logos',await visible.count(), 'errors',s.errors.length);
}
const desktop=await open(1440,900);
for(const [name,route] of [['overview','/dashboard'],['jobs','/jobs'],['receivables','/receivables'],['expenses','/incomeExpense'],['calendar','/calendar?view=calendar'],['documents','/invoice']]){
 await capture(desktop,route,'desktop-'+name,'landing-v3/desktop-'+name+'.webp');
}
await desktop.ctx.close();
const phone=await open(390,844,3);await capture(phone,'/dashboard','phone-overview','landing-v3/phone-overview.webp');await phone.ctx.close();
const dark=await open(1440,900,1,true);await capture(dark,'/dashboard','desktop-dark');await dark.ctx.close();
const darkPhone=await open(390,844,2,true);await capture(darkPhone,'/dashboard','phone-dark');await darkPhone.ctx.close();
for(const width of [1440,390]){
 const s=await open(width,900,1,false,false);
 await capture(s,'/','landing-'+width);await capture(s,'/login','login-'+width);await s.ctx.close();
}
await browser.close();
