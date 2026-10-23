import {expect,test} from '@playwright/test';
const user={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.test',role:'admin',created_at:'2026-01-01T00:00:00Z',user_metadata:{}};
const target={userId:'22222222-2222-4222-8222-222222222222',publicId:'SQ-0000000002',displayName:'บัญชีทดสอบ Pro',role:'user',createdAt:'2026-01-01T00:00:00Z',proStatus:'paid'};
test('admin separates revoke, grant, ban and explicit unban with explanatory confirmations',async({page})=>{
 let status='paid';const writes:any[]=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/auth',r=>r.fulfill({json:{session:{user}}}));
 await page.route('**/api/profile',r=>r.fulfill({json:{userId:user.id,publicId:'SQ-0000000001',displayName:'Admin'}}));
 await page.route('**/api/data*',r=>r.fulfill({json:{snapshot:{jobs:[],expenses:[],goals:[],invoices:[],settings:{profileSetupCompleted:true,userPersona:'freelance'},statuses:[],job_types:[],notif_settings:{enabled:false,pendingQueue:[]}},versions:{cashflow_jobs:{},cashflow_expenses:{},cashflow_goals:{},cashflow_invoices:{},cashflow_documents:{}},subscription:{status:'active',plan:'admin_grant',current_period_end:null}}}));
 await page.route('**/api/groups?*',r=>r.fulfill({json:{systemRole:'admin',groups:[],invitations:[],total:0,page:0}}));
 await page.route('**/api/vault',r=>r.fulfill({json:{files:[]}}));
 await page.route('**/api/account',r=>r.fulfill({json:{backupEmail:null}}));
 await page.route('**/api/usage-analytics',r=>r.fulfill({json:{ok:true}}));
 await page.route('**/api/billing',r=>r.fulfill({json:{checkout_ready:true,subscription:{status:'active',plan:'admin_grant'}}}));
 await page.route('**/api/admin-users**',async r=>{
  const req=r.request(),url=new URL(req.url());
  if(req.method()==='POST'){
   const body=req.postDataJSON();writes.push(body);status=({revoke:'revoked',grant:'admin',ban:'banned',unban:'revoked'} as any)[body.operation];await r.fulfill({json:{ok:true}});return;
  }
  if(url.searchParams.get('action')==='recovery-links'){await r.fulfill({json:{links:[]}});return;}
  if(url.searchParams.get('action')==='deletion-requests'){await r.fulfill({json:{requests:[]}});return;}
  await r.fulfill({json:{users:[{...target,proStatus:status}],total:1,page:0}});
 });
 await page.goto('/groups/admin');
 await page.getByRole('tab',{name:'จัดการผู้ใช้',exact:true}).click();
 await expect(page.getByRole('button',{name:'ปลด Pro',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ปลด Pro',exact:true}).click();
 await expect(page.getByText(/ผู้ใช้สมัครและชำระแพ็กเกจใหม่ได้/)).toBeVisible();
 await page.getByRole('button',{name:'ยืนยัน',exact:true}).click();
 await expect(page.getByText('ปลด Pro · สมัครใหม่ได้',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ให้ Pro',exact:true}).click();
 await page.getByRole('button',{name:'ยืนยัน',exact:true}).click();
 await expect(page.getByText('Pro · แอดมินให้',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'แบน Pro',exact:true}).click();
 await expect(page.getByText(/ห้ามสมัครใหม่จนกว่าแอดมินจะปลดแบน/)).toBeVisible();
 await page.getByRole('button',{name:'ยืนยัน',exact:true}).click();
 await expect(page.getByRole('button',{name:'ปลดแบน Pro',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'ให้ Pro',exact:true})).toHaveCount(0);
 if(process.env.ADMIN_PRO_SCREENSHOT)await page.screenshot({path:process.env.ADMIN_PRO_SCREENSHOT,fullPage:true});
 await page.getByRole('button',{name:'ปลดแบน Pro',exact:true}).click();
 await expect(page.getByText(/โดยไม่คืนสิทธิ์ Pro เดิมให้อัตโนมัติ/)).toBeVisible();
 await page.getByRole('button',{name:'ยืนยัน',exact:true}).click();
 await expect(page.getByRole('button',{name:'ให้ Pro',exact:true})).toBeVisible();
 expect(writes.map(x=>x.operation)).toEqual(['revoke','grant','ban','unban']);
 expect(writes.every(x=>x.userId===target.userId && x.action==='set-pro-access')).toBeTruthy();
});
