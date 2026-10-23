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
await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: SUBSCRIPTION.pro } }) : r.fulfill({ json: { ok: true } }));

 if(!loggedIn) await page.route('**/api/auth',r=>r.fulfill({json:{session:null}}));
 return {page,ctx,errors,dark};
}
async function capture(s:any,route:string,name:string,target?:string){
 await s.page.goto(BASE+route,{waitUntil:'networkidle'});
 await s.page.evaluate(()=>document.fonts.ready); await s.page.waitForTimeout(700);
 if(s.dark && !await s.page.locator('html').evaluate(el=>el.classList.contains('dark'))) { await s.page.getByRole('button',{name:'เปลี่ยนเป็นโหมดมืด',exact:true}).click(); await s.page.waitForTimeout(200); }
 if(route==='/vault') { await s.page.getByRole('combobox',{name:'ปีที่อัปโหลด'}).selectOption({label:'อัปโหลดปี 2569'}); await s.page.waitForTimeout(200); }
 const visible=s.page.locator('.krarok-brand-lockup:visible, .ksm-brand:visible');
 if(!await visible.count()) throw new Error('No visible new logo on '+route);
 if(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw new Error('Horizontal overflow '+route);
 const png=path.join(proof,name+'.png'); await s.page.screenshot({path:png});
 if(target) execFileSync('cwebp',['-quiet','-q','90',png,'-o',path.join(ROOT,'frontend/public',target)]);
 console.log(name, 'logos',await visible.count(), 'errors',s.errors.length);
}

const desktop=await open(1440,900,2);
await capture(desktop,'/vault','vault-year','landing/vault-year.webp');await capture(desktop,'/dashboard','legacy-dashboard','landing/dashboard.webp');await capture(desktop,'/calendar?view=calendar','legacy-calendar','landing/calendar.webp');await capture(desktop,'/report','report','landing/report.webp');await desktop.ctx.close();
const phone=await open(430,932,3);
await capture(phone,'/calendar?view=timeline','narrow-timeline','landing/narrow-timeline.webp');
await capture(phone,'/jobs','narrow-jobs','landing/narrow-jobs.webp');await phone.ctx.close();
await browser.close();
