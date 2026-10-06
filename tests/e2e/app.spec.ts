import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test.beforeEach(async({page})=>{
 await page.route('**/api/groups?*',route=>route.fulfill({json:{systemRole:'user',groups:[],invitations:[],total:0,page:0}}));
 // The browser suite is isolated from Supabase; profile calls must be mocked too.
 await page.route('**/api/profile',route=>route.fulfill({json:{userId:'11111111-1111-4111-8111-111111111111',publicId:'SQ-1111111111',displayName:'Test user'}}));
});
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.com',role:'user',created_at:'2026-01-01T00:00:00Z',user_metadata:{}};
const snapshot={jobs:[],expenses:[],goals:[],invoices:[],settings:{monthlyExpense:0,monthlyRevenueGoal:20000,savingsPercentage:40,profileSetupCompleted:true,userPersona:'freelance'},statuses:[{id:'done',label:'จ่ายเงินครบแล้ว',behavior:'done'},{id:'partial',label:'มัดจำแล้ว',behavior:'partial'},{id:'pending',label:'ยังไม่จ่าย',behavior:'pending'}],job_types:['Sponsored Post'],notif_settings:{enabled:true,alertEmail:user.email,serviceType:'mailto',emailjsServiceId:'',emailjsTemplateId:'',emailjsPublicKey:'',pendingQueue:[],lineUserId:null},avatar_data_url:null,issuer_profile:null};
const versions={cashflow_jobs:{},cashflow_expenses:{},cashflow_goals:{},cashflow_invoices:{},cashflow_documents:{settings:1,statuses:1,job_types:1,notif_settings:1}};

test('refresh shows the branded skeleton until the account session is ready',async({page})=>{
 let releaseAuth!:()=>void;
 const authGate=new Promise<void>(resolve=>{releaseAuth=resolve;});
 await page.route('**/api/auth',async route=>{
  await authGate;
  await route.fulfill({json:{session:null}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('status')).toContainText('กำลังโหลดข้อมูล กรุณารอสักครู่');
 releaseAuth();
 await expect(page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).first()).toBeVisible();
});

test('new-account onboarding is persisted when dismissed and does not return after reload',async({page})=>{
 const newUser={...user,created_at:'2026-09-24T00:00:00Z'};
 let storedSettings={...snapshot.settings,profileSetupCompleted:false};
 let settingsVersion=1;
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user:newUser}}}));
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   for(const change of body.changes||[])if(change.table==='cashflow_documents'&&change.id==='settings'){
    storedSettings=change.data;settingsVersion+=1;
   }
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:{
   snapshot:{...snapshot,settings:storedSettings,notif_settings:{...snapshot.notif_settings,alertEmail:newUser.email}},
   versions:{...versions,cashflow_documents:{...versions.cashflow_documents,settings:settingsVersion}},
   subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'},
  }});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toBeVisible();
 await page.getByRole('button',{name:'ปิดแบบสอบถาม'}).click();
 await expect.poll(()=>storedSettings.profileSetupCompleted).toBe(true);
 await page.reload();
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
 await expect(page.locator('#dashboard-top')).toBeVisible();
});

test('skipping onboarding once persists the handled state for a new session',async({page})=>{
 const newUser={...user,created_at:'2026-09-24T00:00:00Z'};
 let storedSettings={...snapshot.settings,profileSetupCompleted:false};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user:newUser}}}));
 await page.route('**/api/data*',route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   for(const change of body.changes||[])if(change.table==='cashflow_documents'&&change.id==='settings')storedSettings=change.data;
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:{snapshot:{...snapshot,settings:storedSettings},versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toBeVisible();
 await page.getByRole('button',{name:'ข้าม',exact:true}).click();
 await expect.poll(()=>storedSettings.profileSetupCompleted).toBe(true);
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
});

test('completing onboarding persists and never repeats',async({page})=>{
 const newUser={...user,created_at:'2026-09-24T00:00:00Z'};
 let storedSettings={...snapshot.settings,profileSetupCompleted:false};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user:newUser}}}));
 await page.route('**/api/data*',route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   for(const change of body.changes||[])if(change.table==='cashflow_documents'&&change.id==='settings')storedSettings=change.data;
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:{snapshot:{...snapshot,settings:storedSettings},versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');
 for(let step=0;step<3;step++)await page.getByRole('button',{name:'ถัดไป',exact:true}).click();
 await page.getByRole('button',{name:'เริ่มใช้งานเลย!'}).click();
 await expect.poll(()=>storedSettings.profileSetupCompleted).toBe(true);
 await page.reload();
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
});

test('accounts created before rollout are never prompted retroactively',async({page})=>{
 const existingUser={...user,created_at:'2026-09-22T23:59:59Z'};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user:existingUser}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,settings:{...snapshot.settings,profileSetupCompleted:false}},versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
 await expect(page.locator('#dashboard-top')).toBeVisible();
});
test('retired duplicate finance tabs resolve to the current calendar and income pages',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 const sidebar=page.locator('aside');
 await expect(sidebar.getByRole('button',{name:'ไทม์ไลน์ปฏิทินงาน'})).toHaveCount(0);
 await expect(sidebar.getByRole('button',{name:'สรุปยอดรายรับ & ออม'})).toHaveCount(0);
 await sidebar.getByRole('button',{name:'ปฏิทิน',exact:true}).click();
 await expect(page.getByRole('heading',{name:'ปฏิทิน',exact:true,level:1})).toBeVisible();
 // Calendar view is the default; its period heading (month / week range) is the page's h2.
 await expect(page.getByRole('tab',{name:'ปฏิทิน'})).toHaveAttribute('aria-selected','true');
 const calendarHeading=page.getByRole('heading',{level:2});
 const monthHeading=await calendarHeading.textContent();
 await page.getByRole('button',{name:'สัปดาห์',exact:true}).click();
 await expect(page.locator('[data-calendar-view="week"]')).toBeVisible();
 await expect(page.locator('[data-calendar-view="week"] button[aria-label]')).toHaveCount(7);
 await expect(page.getByRole('button',{name:'สัปดาห์',exact:true})).toHaveAttribute('aria-pressed','true');
 const weekHeading=await calendarHeading.textContent();
 expect(weekHeading).not.toBe(monthHeading);
 await page.getByRole('button',{name:'สัปดาห์ถัดไป'}).click();
 await expect(calendarHeading).not.toHaveText(weekHeading||'');
 await page.getByRole('button',{name:'เดือน',exact:true}).click();
 await expect(page.locator('[data-calendar-view="month"]')).toBeVisible();
 await sidebar.getByRole('button',{name:'รายจ่าย',exact:true}).click();
 await expect(page.getByRole('heading',{name:'รายจ่าย',exact:true,level:1})).toBeVisible();
 // The retired /timeline page now opens the calendar's Timeline view.
 await page.goto('/timeline');
 await expect(page.getByRole('heading',{name:'ปฏิทิน',exact:true,level:1})).toBeVisible();
 await expect(page.getByRole('tab',{name:'ไทม์ไลน์'})).toHaveAttribute('aria-selected','true');
 await page.goto('/summary');
 await expect(page.getByRole('heading',{name:'รายจ่าย',exact:true,level:1})).toBeVisible();
});
test('credit report stays concise and hands collection work to receivables',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'รายงาน',exact:true}).click();
 await page.getByRole('tab',{name:'ระยะเวลารับเงิน',exact:true}).click();
 await expect(page.getByRole('heading',{name:'ช่วงเวลาที่เงินควรเข้า'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'รายงานวิเคราะห์กระแสเงินสดและเงินออม'})).toHaveCount(0);
 await page.getByRole('button',{name:/ดูเงินค้างรับ/}).click();
 await expect(page.getByText('ไม่มีเงินค้างรับ',{exact:true})).toBeVisible();
});
test('login and all feature tabs render after separation without browser errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let loggedIn=false;
 await page.route('**/api/auth',route=>{
  const request=route.request();
  if(request.method()==='POST') { expect(request.headers()['x-csrf-protection']).toBe('1');loggedIn=request.postDataJSON().action!=='logout'; }
  return route.fulfill({json:{session:loggedIn?{user}:null,user:loggedIn?user:null}});
 });
 await page.route('**/api/data*',route=>route.fulfill({json:route.request().method()==='POST'?{ok:true}:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.route('**/api/groups?*',route=>route.fulfill({json:{systemRole:'user',groups:[],invitations:[],total:0,page:0}}));
 await page.goto('/');
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).first().click();
 await page.locator('input[type=email]').first().fill(user.email);
 await page.locator('input[type=password]').first().fill('test-password-123');
 await page.locator('form button[type=submit]').first().click();
 await expect(page.locator('#dashboard-top')).toBeVisible();
 await expect(page.getByRole('heading',{name:'ภาพรวม',exact:true})).toBeVisible();
 const sidebar=page.locator('aside');
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
 await expect(page.getByText('วางแผนวันนี้ ให้เงินเติบโตทุกวัน')).toHaveCount(0);
 for(const action of ['รับเงินด่วน','เพิ่มรายรับ','เพิ่มรายจ่าย'])await expect(page.getByRole('button',{name:action})).toBeVisible();
 const quickPay=page.getByRole('button',{name:'รับเงินด่วน'});
 await quickPay.click();
 await expect(page.getByRole('heading',{name:'บันทึกรับเงินด่วน'})).toBeVisible();
 await expect(page.locator('.fixed.inset-0').locator('input[type=text]')).toBeVisible();
 await page.getByRole('button',{name:'ปิดหน้าต่างรับเงินด่วน'}).click();
 const names=await sidebar.locator('nav button').allTextContents();
 for(const name of names) {
  const button=sidebar.locator('nav button').filter({hasText:name.trim()}).first();
  if(await button.isVisible()) { await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(page.locator('#main-content')).not.toContainText('กำลังโหลด');await expect(page.getByText('โหลดหน้านี้ไม่สำเร็จ',{exact:true})).toHaveCount(0); }
 }
 await sidebar.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
 await expect(page.getByRole('heading',{name:'บัญชี',exact:true})).toBeVisible();
 await expect(page.getByText('SQ-1111111111',{exact:true}).first()).toBeVisible();
 await sidebar.locator('nav button').first().click();
 await expect(page.locator('#dashboard-top')).toBeVisible();
 if(await page.locator('html').evaluate(el=>el.classList.contains('dark')))await sidebar.getByRole('button').last().click();
 await expect(page.locator('#dashboard-top')).toBeVisible();
 await page.waitForTimeout(350);
 await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
 expect(errors).toEqual([]);
 const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},cookie:document.cookie}));
 expect(JSON.stringify(storage)).not.toContain('access_token');expect(JSON.stringify(storage)).not.toContain('refresh_token');
 for(const key of [...Object.keys(storage.local),...Object.keys(storage.session)])expect(key).not.toMatch(/^cashflow_(jobs|goals|settings|statuses|job_types|expenses|notif_settings|user_avatar|invoices|issuer)(_|$)/);
});
test('LIFF form loads under production CSP without inline handlers',async({page})=>{
 await page.route('https://static.line-scdn.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>false};'}));
 await page.route('**/api/liff-config',route=>route.fulfill({json:{liffId:'test-liff'}}));
 await page.goto('/liff-add.html');
 await page.locator('#tab-expense').click();await expect(page.locator('#expense-card')).toBeVisible();
 await page.locator('#tab-income').click();await expect(page.locator('#job-card')).toBeVisible();
 expect(await page.locator('[onclick]').count()).toBe(0);
});
test('mobile login layout remains inside the viewport',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:null}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'เริ่มใช้งานฟรี',exact:true}).first().click();
 await expect(page.locator('input[type=email]').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/mobile-login.png',fullPage:true});
});

test('add-job sheet stays in the viewport and success feedback appears at the top',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:route.request().method()==='POST'?{ok:true}:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 await page.locator('aside').getByRole('button',{name:'งาน',exact:true}).click();
 await page.getByRole('button',{name:'เพิ่มงาน',exact:true}).first().click();
 const sheet=page.getByRole('heading',{name:'เพิ่มงาน',exact:true}).locator('..').locator('..');
 await expect(sheet).toBeVisible();
 await expect.poll(async()=>{const box=await sheet.boundingBox();return box ? Math.round(box.y) : 9999;}).toBeLessThan(900);
 await expect.poll(async()=>{const box=await sheet.boundingBox();return box ? Math.round(box.y+box.height) : 9999;}).toBeLessThanOrEqual(900);
 expect(await sheet.evaluate(el=>el.closest('.fixed')?.parentElement===document.body)).toBe(true);

 await page.getByRole('button',{name:'บันทึกงาน'}).click();
 await expect(page.getByText('กรุณาระบุชื่องาน')).toBeVisible();
 await page.getByLabel('ชื่องาน / โปรเจกต์').fill('Regression project');
 await page.getByLabel('มูลค่างาน').fill('1000');
 await page.getByRole('button',{name:'บันทึกงาน'}).click();
 await expect(page.getByRole('heading',{name:'เพิ่มงาน',exact:true})).toHaveCount(0);
 const toast=page.locator('[aria-live="polite"]').getByText(/Regression project/);
 await expect(toast).toBeVisible();
 const toastBox=await toast.locator('..').boundingBox();
 expect(toastBox).not.toBeNull();
 expect(toastBox!.y).toBeLessThan(220);
});

test('tax Excel export downloads after loading the spreadsheet writer on demand',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'ภาษี',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'ดาวน์โหลด Excel (.xlsx)'}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});

test('legacy invoice requires owner confirmation and is saved through versioned backend API',async({page})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'',bankName:'',bankAccount:'',bankAccountName:''};
 const legacy={id:'legacy-invoice',documentType:'invoice',documentNo:'INV-LEGACY-001',createdDate:'2026-09-17',issuer:profile,client:{name:'Test client',address:'Bangkok',phone:'',email:'',taxId:''},items:[{id:'item',description:'Consulting',quantity:1,price:100}],vatRate:0,whtRate:0};
 await page.addInitScript(value=>localStorage.setItem('remix_invoices',JSON.stringify([value])),legacy);
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 let saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){
   expect(route.request().headers()['x-account-id']).toBe(user.id);
   saved.push(...route.request().postDataJSON().changes);
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:{snapshot,versions,subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 await expect(page.getByRole('region',{name:'รายการเอกสาร'}).getByText('0 รายการ')).toBeVisible();
 expect(saved.some(c=>c.table==='cashflow_invoices')).toBe(false);
 await page.getByRole('button',{name:'นำเข้าเอกสารเดิมจากเครื่อง'}).click();
 await page.locator('[role=presentation]').getByRole('button',{name:'ยืนยัน',exact:true}).click();
 await expect.poll(()=>saved.filter(c=>c.table==='cashflow_invoices').length).toBe(1);
 expect(saved.find(c=>c.table==='cashflow_invoices')).toMatchObject({id:'legacy-invoice',version:null,op:'set'});
 await expect(page.getByRole('region',{name:'รายการเอกสาร'}).getByText('1 รายการ')).toBeVisible();
});

test('invoice preview and print render the shared A4 document and the editor offers the four creatable types',async({page,context})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'1234567890123',bankName:'KBank',bankAccount:'012-3-45678-9',bankAccountName:'Test issuer'};
 const invoice={id:'tax-1',documentType:'receiptTaxInvoice',documentNo:'RTX-2569-001',createdDate:'2026-09-17',issuer:profile,client:{name:'<b>Client</b>',address:'Bangkok',phone:'',email:'',taxId:'0105560123456',branch:'สำนักงานใหญ่'},items:[{id:'i1',description:'Design work',unit:'งาน',quantity:2,price:1000,discount:100}],vatRate:7,whtRate:0,paymentMethod:'โอนเงิน'};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,invoices:[invoice]},versions:{...versions,cashflow_invoices:{'tax-1':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 const preview=page.getByTestId('document-preview');
 await expect(page.getByRole('heading',{name:'เอกสาร',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:/ใบเสนอราคา/})).toBeVisible();
 await expect(page.getByRole('tab',{name:/ใบแจ้งหนี้/})).toBeVisible();
 await expect(page.getByRole('button',{name:'แก้ไข'})).toBeVisible();
 await expect(page.getByRole('button',{name:/แชร์ให้ลูกค้า/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Duplicate/})).toHaveCount(0);
 await expect(page.getByTestId('document-reveal')).toBeVisible();
 await expect(preview.getByRole('heading',{name:'ใบเสร็จรับเงิน/ใบกำกับภาษี'})).toBeVisible();
 await expect(preview).toContainText('(ต้นฉบับ)');
 await expect(preview).toContainText('1,900.00');
 await expect(preview).toContainText('2,033.00');
 await expect(preview).toContainText('สองพันสามสิบสามบาทถ้วน');
 await expect(preview.locator('b')).toHaveCount(0);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'ดาวน์โหลด PDF'}).click()]);
 expect(download.suggestedFilename()).toBe('RTX-2569-001.pdf');
 const pdfBytes=readFileSync(await download.path());
 expect(pdfBytes.subarray(0,5).toString()).toBe('%PDF-');
 expect((pdfBytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length).toBe(1);
 const popupPromise=context.waitForEvent('page');
 await page.getByRole('button',{name:'แชร์ให้ลูกค้า'}).click();
 await page.getByRole('menuitem',{name:/พิมพ์/}).click();
 const popup=await popupPromise;
 await expect(popup.locator('.da4-page')).toHaveCount(1);
 await expect(popup.locator('.da4-page')).toContainText('2,033.00');
 expect(await popup.locator('b').count()).toBe(0);
 const printed=await context.newPage();
 await printed.setContent(await popup.content());
 const pdf=await printed.pdf({preferCSSPageSize:true,printBackground:true});
 await printed.close();
 expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length).toBe(1); // one document page = one sheet
 await popup.close();
 await page.getByRole('button',{name:'ออกเอกสารใหม่'}).click();
 await page.getByRole('menuitem',{name:'ใบแจ้งหนี้'}).click();
 const typeSelect=page.locator('select:has(option[value=taxInvoice])');
 await expect(typeSelect.locator('option')).toHaveCount(4);
 await typeSelect.selectOption('taxInvoice');
 await expect(page.getByPlaceholder('หน่วย')).toBeVisible();
 await expect(page.getByPlaceholder('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toBeVisible();
});

test('document tabs stay on the chosen type even when it has no documents, and survive a refresh',async({page})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'1234567890123'};
 const quote={id:'qt-1',documentType:'quotation',documentNo:'QT-2569-001',createdDate:'2026-09-17',issuer:profile,client:{name:'Client A',address:'',phone:'',email:'',taxId:''},items:[{id:'i1',description:'Design',quantity:1,price:6790}],vatRate:0,whtRate:0};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,invoices:[quote]},versions:{...versions,cashflow_invoices:{'qt-1':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 const tab=(name:string)=>page.getByRole('tab',{name:new RegExp(`^${name}`)});
 await expect(tab('ใบเสนอราคา')).toHaveAttribute('aria-selected','true');
 for(const name of ['ใบแจ้งหนี้','ใบเสร็จ','ใบกำกับภาษี','ใบแจ้งหนี้','ใบเสนอราคา','ใบกำกับภาษี']){
  await tab(name).click();
  await expect(tab(name)).toHaveAttribute('aria-selected','true');
  await page.waitForTimeout(150); // the old bug bounced back to ใบเสนอราคา right after the click
  await expect(tab(name)).toHaveAttribute('aria-selected','true');
  if(name!=='ใบเสนอราคา') await expect(page.getByText(`ยังไม่มี${name}`).first()).toBeVisible();
 }
 await tab('ใบเสร็จ').click();
 await expect(page).toHaveURL(/[?&]type=receipt/);
 await page.reload();
 await expect(tab('ใบเสร็จ')).toHaveAttribute('aria-selected','true');
 await tab('ใบเสนอราคา').click();
 await expect(page.getByTestId('document-preview')).toContainText('6,790');
 await page.getByRole('button',{name:'แชร์ให้ลูกค้า'}).click();
 await expect(page.getByRole('menuitem',{name:/คัดลอกข้อความ/})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:/ดาวน์โหลด PDF/})).toBeVisible();
 expect(errors).toEqual([]);
});

test('uploaded logo and signature are saved to the profile and appear on existing documents',async({page})=>{
 let profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'',bankName:'',bankAccount:'',bankAccountName:''};
 const invoice={id:'old-1',documentType:'invoice',documentNo:'INV-OLD-001',createdDate:'2026-09-17',issuer:profile,client:{name:'Client',address:'',phone:'',email:'',taxId:''},items:[{id:'i1',description:'Work',quantity:1,price:100}],vatRate:0,whtRate:0};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGN4Fq/9Hx9mGBkKAFHYm8E0k7sPAAAAAElFTkSuQmCC','base64');
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){
   const changes=route.request().postDataJSON().changes;
   saved.push(...changes);
   const issuerChange=changes.find((change:any)=>change.id==='issuer_profile');
   if(issuerChange)profile=issuerChange.data;
   return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({json:{snapshot:{...snapshot,invoices:[invoice],issuer_profile:profile},versions:{...versions,cashflow_invoices:{'old-1':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 const preview=page.getByTestId('document-preview');
 await expect(preview).toContainText('INV-OLD-001');
 await expect(preview.locator('.da4-logo')).toHaveCount(0);
 await sidebar.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
 await page.getByRole('button',{name:'โปรไฟล์ธุรกิจ',exact:true}).click();
 const files=page.locator('input[type=file]');
 await expect(files).toHaveCount(2); // logo, signature
 await files.nth(0).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
 await files.nth(1).setInputFiles({name:'sign.png',mimeType:'image/png',buffer:png});
 await expect(page.getByTestId('document-preview').locator('.da4-logo')).toHaveCount(1);
 await expect(page.getByTestId('document-preview').locator('.da4-sig img')).toHaveCount(2);
 await page.getByLabel('ธนาคาร',{exact:true}).selectOption('ธนาคารกสิกรไทย');
 await page.getByPlaceholder('เช่น 123-4-56789-0').fill('012-3-45678-9');
 await page.getByRole('slider',{name:'ขนาดโลโก้บนเอกสาร'}).fill('152');
 await page.getByRole('button',{name:'ขวา',exact:true}).click();
 await expect(page.getByTestId('document-preview').locator('.da4-top.pos-right .da4-logo')).toHaveCount(1); // live, before saving
 await page.getByRole('button',{name:/บันทึก/}).last().click();
 await page.getByRole('button',{name:'ตกลง',exact:true}).click();
 await expect.poll(()=>saved.some(c=>c.id==='issuer_profile'&&c.data.logoUrl?.startsWith('data:image')&&c.data.signatureUrl?.startsWith('data:image')&&c.data.logoHeight===152&&c.data.logoPosition==='right'&&c.data.bankName==='ธนาคารกสิกรไทย')).toBe(true);
 await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 await expect(page.getByTestId('document-preview').locator('.da4-logo')).toHaveCount(1);
 await expect(page.getByTestId('document-preview').locator('.da4-chip')).toHaveText('KBANK');
 await expect(page.getByTestId('document-preview').locator('.da4-top.pos-right')).toHaveCount(1);
 await expect(page.getByTestId('document-preview').locator('.da4-logo')).toHaveAttribute('style',/max-height: 152px/);
 await expect(page.getByTestId('document-preview').locator('.da4-sig img')).toHaveCount(2); // signature + seller stamp (logo)
 await sidebar.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
 await page.getByRole('button',{name:'โปรไฟล์ธุรกิจ',exact:true}).click();
 await page.getByRole('slider',{name:'เลื่อนโลโก้ซ้าย-ขวา'}).fill('30');
 await expect(page.getByTestId('document-preview').locator('.da4-top.pos-custom')).toHaveAttribute('style',/--da4-x: 30%/);
});

test('quick-pay payment dialog is clickable on top of the quick-pay list, not hidden behind it',async({page})=>{
 // Regression test for CustomDialog rendering inline instead of portaled: with an ancestor
 // between it and <body> that opens its own stacking context, its z-[999] only wins inside that
 // context, so a later document.body portal (Dashboard's own quick-pay list) painted over it. The
 // confirm dialog was still in the DOM and technically at the right coordinates, so a raw click
 // there did nothing visible -- exactly what marking a partially-paid job as fully paid from this
 // list looked like to a user. Playwright's own .click() already fails loudly if the target isn't
 // the topmost element at its point, so this test would fail on the old inline-rendered dialog.
 const partialJob={id:'partial-job',name:'ผลิตคลิปโฆษณา TikTok',value:8000,received:4000,pending:4000,client:'ร้านกาแฟ Brew Days',type:'Video Production',status:'partial',paymentStatus:'partial',creditTerm:15,note:'',payDate:null};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){saved.push(...route.request().postDataJSON().changes);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{snapshot:{...snapshot,jobs:[partialJob]},versions:{...versions,cashflow_jobs:{'partial-job':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.route('**/api/groups?*',route=>route.fulfill({json:{systemRole:'user',groups:[],invitations:[],total:0,page:0}}));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 await page.getByRole('button',{name:'รับเงินด่วน'}).click();
 await expect(page.getByRole('heading',{name:'บันทึกรับเงินด่วน'})).toBeVisible();
 const quickPayModal=page.locator('.fixed.inset-0').filter({has:page.getByRole('heading',{name:'บันทึกรับเงินด่วน'})});
 await expect(quickPayModal.getByText('ผลิตคลิปโฆษณา TikTok',{exact:true})).toBeVisible();
 await quickPayModal.getByRole('button',{name:'รับเงิน',exact:true}).click();
 // Same payment dialog as the Jobs page: remaining amount for a partly paid job, and a date.
 const paymentDialog=page.getByRole('dialog',{name:'บันทึกรับเงิน',exact:true});
 await expect(paymentDialog).toBeVisible();
 await expect(paymentDialog.getByText('ยอดที่รับครั้งนี้')).toBeVisible();
 await expect(paymentDialog.getByText('฿4,000',{exact:true})).toBeVisible();
 await paymentDialog.getByRole('button',{name:'บันทึกรับเงิน'}).click(); // throws if occluded by the quick-pay modal
 await expect(quickPayModal.getByText('ผลิตคลิปโฆษณา TikTok',{exact:true})).toHaveCount(0);
 await expect.poll(()=>saved.find(c=>c.id==='partial-job')?.data?.paymentStatus).toBe('paid');
 expect(saved.find(c=>c.id==='partial-job')?.data?.received).toBe(8000);
 await expect(page.getByRole('status').getByRole('button',{name:'เลิกทำ'})).toBeVisible();
});

test('expired authentication hides private views and never leaves financial browser caches',async({page})=>{
 const privateJob={id:'private-job',name:'Private account record',value:100,received:0,pending:100,client:'Private client',type:'Design',status:'pending',creditTerm:0,note:'',payDate:null};
 let expired=false;
 await page.addInitScript(()=>{
  localStorage.setItem('cashflow_jobs_old@example.com','[{"name":"stale private record"}]');
  sessionStorage.setItem('cashflow_invoices_old-owner','[{"documentNo":"PRIVATE"}]');
 });
 await page.route('**/api/auth',route=>route.fulfill({json:{session:expired?null:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,jobs:[privateJob]},versions:{...versions,cashflow_jobs:{'private-job':1}},subscription:null}}));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 expired=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('input[type=email]').first()).toBeVisible();await expect(page.locator('#main-content')).toHaveCount(0);
 const storage=await page.evaluate(()=>({...localStorage,...sessionStorage}));
 for(const key of Object.keys(storage))expect(key).not.toMatch(/^cashflow_(jobs|goals|settings|statuses|job_types|expenses|notif_settings|user_avatar|invoices|issuer)(_|$)/);
 expect(JSON.stringify(storage)).not.toContain('Private account record');
});

test('account switching cannot reuse the previous account invoice working copy',async({page})=>{
 const second={...user,id:'22222222-2222-4222-8222-222222222222',email:'second@example.com'};
 const profile={name:'Private issuer A',address:'Bangkok',phone:'',email:'',taxId:'',bankName:'',bankAccount:'',bankAccountName:''};
 const invoice={id:'private-a',documentType:'invoice',documentNo:'INV-PRIVATE-A',createdDate:'2026-09-17',issuer:profile,client:{name:'Private client A',address:'',phone:'',email:'',taxId:''},items:[],vatRate:0,whtRate:0};
 let switched=false;
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user:switched?second:user}}}));
 await page.route('**/api/data*',route=>{
  const owner=route.request().headers()['x-account-id'];
  return route.fulfill({json:{snapshot:{...snapshot,invoices:owner===user.id?[invoice]:[]},versions:{...versions,cashflow_invoices:owner===user.id?{'private-a':1}:{}},subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เอกสาร',exact:true}).click();
 await expect(page.getByText('INV-PRIVATE-A').first()).toBeVisible();
 switched=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText('INV-PRIVATE-A')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'รายการเอกสาร'}).getByText('0 รายการ')).toBeVisible();
});

test('a protected API 401 immediately removes private views without waiting for the session timer',async({page})=>{
 let denied=false;
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>denied?route.fulfill({status:401,json:{error:'Session expired'}}):route.fulfill({json:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 denied=true;const sidebar=page.locator('aside');
 await expect(page.locator('input[type=email]').first()).toBeVisible();await expect(page.locator('#main-content')).toHaveCount(0);
});

test('settings overview shows current values and opens each setting on its own page',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/account',route=>route.fulfill({json:{backupEmail:null}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){saved.push(...route.request().postDataJSON().changes);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{snapshot:{...snapshot,settings:{...snapshot.settings,monthlyExpense:12000,fixedExpenseItems:[{id:'rent',name:'ค่าห้อง',amount:12000}],monthlyRevenueGoal:25000}},versions,subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 const sidebar=page.locator('aside');
 await sidebar.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
 const main=page.locator('#main-content');
 // overview: summary values, real LINE logo, no forms or document preview
 await expect(main.getByText('SQ-1111111111',{exact:true})).toBeVisible();
 await expect(main.getByRole('button',{name:'รายจ่ายประจำ',exact:true})).toContainText('฿12,000');
 await expect(main.getByRole('button',{name:'เป้ารายรับต่อเดือน',exact:true})).toContainText('฿25,000');
 await expect(main.getByRole('button',{name:'LINE',exact:true}).getByRole('img',{name:'LINE'})).toBeVisible();
 await expect(main.getByRole('button',{name:'LINE',exact:true})).toContainText('ยังไม่ได้เชื่อมต่อ');
 await expect(main.locator('input:not([type=file])')).toHaveCount(0);
 await expect(page.getByTestId('document-preview')).toHaveCount(0);
 await expect(main.getByText('แพ็กเกจ Pro')).toHaveCount(0);
 // goals toggle writes the existing feature flag
 await main.getByRole('switch',{name:'เป้าหมายการเงิน & การจัดสรร'}).click();
 await expect(main.getByRole('switch',{name:'เป้าหมายการเงิน & การจัดสรร'})).toHaveAttribute('aria-checked','false');
 await expect.poll(()=>saved.some(c=>c.id==='settings'&&c.data.goalsFeatureEnabled===false)).toBe(true);
 // income target in a compact sheet
 await main.getByRole('button',{name:'เป้ารายรับต่อเดือน',exact:true}).click();
 await page.getByRole('dialog').getByRole('textbox').fill('30000');
 await page.getByRole('dialog').getByRole('button',{name:'บันทึก',exact:true}).click();
 await expect(main.getByRole('button',{name:'เป้ารายรับต่อเดือน',exact:true})).toContainText('฿30,000');
 // theme sheet
 await main.getByRole('button',{name:'การแสดงผล',exact:true}).click();
 const dark=await page.locator('html').evaluate(el=>el.classList.contains('dark'));
 await page.getByRole('dialog').getByRole('radio',{name:dark?'สว่าง':'มืด'}).click();
 await expect.poll(()=>page.locator('html').evaluate(el=>el.classList.contains('dark'))).toBe(!dark);
 await page.keyboard.press('Escape');
 // a detail page has a back link and no settings sidebar
 await main.getByRole('button',{name:'บัญชี & ความปลอดภัย',exact:true}).click();
 await expect(page.getByRole('heading',{name:'บัญชี & ความปลอดภัย'})).toBeVisible();
 await expect(main.getByText('แพ็กเกจ Pro')).toHaveCount(0);
 await main.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
 // import asks before replacing data
 await main.getByRole('button',{name:'สำรอง & นำเข้าข้อมูล',exact:true}).click();
 const before=saved.length;
 await page.locator('#json-settings-uploader').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({settings:{...snapshot.settings,monthlyRevenueGoal:99999}}))});
 await expect(page.getByText('นำเข้าข้อมูลจากไฟล์สำรอง')).toBeVisible();
 await page.waitForTimeout(1800);
 expect(saved.slice(before).some(c=>c.id==='settings'&&c.data.monthlyRevenueGoal===99999)).toBe(false);
 await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a job can be paid in full while still in progress and keeps its payment date when delivered',async({page})=>{
 const wip={id:'wip-job',name:'ถ่ายคลิปรีวิว',value:3000,received:0,pending:3000,client:'ร้านตัวอย่าง',type:'Sponsored Post',status:'pending',paymentStatus:'unpaid',creditTerm:15,note:'',payDate:null,isPosted:false,startDate:'2026-10-01'};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){saved.push(...route.request().postDataJSON().changes);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{snapshot:{...snapshot,jobs:[wip]},versions:{...versions,cashflow_jobs:{'wip-job':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 await page.locator('aside').getByRole('button',{name:'งาน',exact:true}).click();
 await page.getByRole('tab',{name:/^กำลังทำ/}).click();
 const main=page.locator('#main-content');
 await main.getByRole('button',{name:'เปลี่ยนการชำระของงาน ถ่ายคลิปรีวิว'}).first().click();
 await page.getByRole('menuitem',{name:'รับเงินครบ'}).click();
 await page.locator('input[type=date]').last().fill('2026-10-02');
 await page.getByRole('button',{name:'บันทึกรับเงิน'}).click();
 await expect.poll(()=>saved.some(c=>c.id==='wip-job'&&c.data.status==='done'&&c.data.pending===0&&c.data.payDate==='2026-10-02'&&c.data.isPosted===false)).toBe(true);
 await expect(page.getByRole('tab',{name:/^กำลังทำ/})).toContainText('1');
 await expect(main.getByRole('button',{name:'เปลี่ยนสถานะงานของงาน ถ่ายคลิปรีวิว'}).first()).toContainText('กำลังทำ');
 // delivering it later closes the job without moving the payment date to the credit-term date
 await main.getByRole('button',{name:'เปลี่ยนสถานะงานของงาน ถ่ายคลิปรีวิว'}).first().click();
 await page.getByRole('menuitem',{name:'ส่งงานแล้ว'}).click();
 await expect(page.getByText('งานนี้รับเงินครบแล้ว บันทึกแล้วจะย้ายไปปิดงานทันที')).toBeVisible();
 await page.getByRole('button',{name:'บันทึกงานเสร็จแล้ว',exact:true}).click();
 await expect.poll(()=>saved.some(c=>c.id==='wip-job'&&c.data.isPosted===true&&c.data.payDate==='2026-10-02')).toBe(true);
});

test('calendar shows how much money the open month brings in, matching the timeline',async({page})=>{
 const now=new Date();const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
 const paid={id:'paid',name:'งานรับแล้ว',value:5000,received:5000,pending:0,client:'ลูกค้า A',type:'Sponsored Post',status:'done',paymentStatus:'paid',creditTerm:0,note:'',postDate:`${ym}-01`,payDate:`${ym}-02`,isPosted:true};
 const waiting={id:'wait',name:'งานรอรับ',value:3000,received:0,pending:3000,client:'ลูกค้า B',type:'Sponsored Post',status:'pending',paymentStatus:'unpaid',creditTerm:0,note:'',postDate:`${ym}-28`,payDate:`${ym}-28`,isPosted:true};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.request().method()==='POST'?route.fulfill({json:{ok:true}}):route.fulfill({json:{snapshot:{...snapshot,jobs:[paid,waiting]},versions:{...versions,cashflow_jobs:{paid:1,wait:1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/calendar?view=calendar');
 const card=page.getByRole('region',{name:'เงินเข้าเดือนนี้'});
 await expect(card).toContainText('฿8,000');
 await expect(card).toContainText('รับแล้ว');
 await expect(card).toContainText('฿5,000');
 await card.getByRole('button',{name:/ดูในไทม์ไลน์/}).click();
 await expect(page.getByRole('tab',{name:/ไทม์ไลน์/})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#main-content')).toContainText('฿8,000');
});

test('marking work as done previews the expected payment date with the same calculation that is saved',async({page})=>{
 const wip={id:'wip2',name:'ตัดต่อวิดีโอ',value:4000,received:0,pending:4000,client:'ลูกค้า C',type:'Sponsored Post',status:'pending',paymentStatus:'unpaid',creditTerm:30,note:'',payDate:null,isPosted:false,startDate:'2026-10-01'};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){saved.push(...route.request().postDataJSON().changes);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{snapshot:{...snapshot,jobs:[wip]},versions:{...versions,cashflow_jobs:{wip2:1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 await page.locator('aside').getByRole('button',{name:'งาน',exact:true}).click();
 await page.getByRole('tab',{name:/^กำลังทำ/}).click();
 await page.locator('#main-content').getByRole('button',{name:'เปลี่ยนสถานะงานของงาน ตัดต่อวิดีโอ'}).first().click();
 await page.getByRole('menuitem',{name:'ส่งงานแล้ว'}).click();
 const dialog=page.getByRole('dialog',{name:'บันทึกว่างานเสร็จแล้ว'});
 await expect(dialog.getByRole('radio',{name:'30 วัน'})).toHaveAttribute('aria-checked','true');
 await dialog.getByLabel('วันที่ส่งงาน / ให้บริการ').fill('2026-12-15');
 // 30 calendar days crosses the year
 await expect(dialog.getByTestId('expected-pay-date')).toHaveText(/14 ม\.ค\. 2570/);
 await dialog.getByRole('radio',{name:'ทันที'}).click();
 await expect(dialog.getByTestId('expected-pay-date')).toHaveText(/15 ธ\.ค\. 2569/);
 await expect(dialog).toContainText('ชำระทันที');
 // business days skip weekends and Thai holidays (31 Dec / 1 Jan)
 await dialog.getByRole('radio',{name:'45 วัน'}).click();
 await dialog.getByRole('checkbox').check();
 await expect(dialog.getByTestId('expected-pay-date')).toHaveCount(1);
 await expect(dialog.getByTestId('expected-pay-date')).not.toHaveText(/15 ธ\.ค\. 2569/);
 const preview=(await dialog.getByTestId('expected-pay-date').innerText()).trim();
 // a cleared date blocks saving with an inline message
 await dialog.getByLabel('วันที่ส่งงาน / ให้บริการ').fill('');
 await expect(dialog.getByText('กรุณาเลือกวันที่ส่งงาน / ให้บริการ')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'บันทึกงานเสร็จแล้ว'})).toBeDisabled();
 await dialog.getByLabel('วันที่ส่งงาน / ให้บริการ').fill('2026-12-15');
 await expect(dialog.getByTestId('expected-pay-date')).toHaveText(preview);
 await dialog.getByRole('button',{name:'บันทึกงานเสร็จแล้ว'}).click();
 await expect(dialog).toHaveCount(0);
 await expect.poll(()=>saved.find(c=>c.id==='wip2'&&c.data.isPosted===true)?.data).toMatchObject({postDate:'2026-12-15',creditTerm:45,excludeHolidays:true});
 const stored=saved.find(c=>c.id==='wip2'&&c.data.isPosted===true).data.payDate;
 const [y,m,d]=stored.split('-').map(Number);
 const shown=new Date(y,m-1,d).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'});
 expect(preview).toBe(shown);
});

test('documents are shown large and pulled out of the pocket by scrolling, without zoom controls',async({page})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'1234567890123'};
 const quote={id:'qt-r',documentType:'quotation',documentNo:'QT-2569-009',createdDate:'2026-09-17',issuer:profile,client:{name:'Client R',address:'',phone:'',email:'',taxId:''},items:[{id:'i1',description:'Design',quantity:1,price:6790}],vatRate:0,whtRate:0};
 await page.setViewportSize({width:1280,height:720});
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,invoices:[quote]},versions:{...versions,cashflow_invoices:{'qt-r':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/invoice?type=quotation');
 const reveal=page.getByTestId('document-reveal');
 await expect(reveal).toHaveAttribute('data-reveal','peek');
 await expect(page.getByText('พอดีหน้า')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'ขยาย'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'ย่อ'})).toHaveCount(0);
 const paper=reveal.getByTestId('document-preview');
 const width=(await paper.boundingBox())!.width;
 expect(width).toBeGreaterThan(500); // readable, not a thumbnail
 const box=(await reveal.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 for(let i=0;i<8;i++){await page.mouse.wheel(0,90);await page.waitForTimeout(20);}
 await expect(reveal).toHaveAttribute('data-reveal','full');
 expect((await paper.boundingBox())!.width).toBeCloseTo(width,0); // moved, never resized
 await reveal.focus();await page.keyboard.press('ArrowUp');
 await expect(reveal).toHaveAttribute('data-reveal','peek');
 await page.getByRole('button',{name:'ดูเอกสารทั้งหมด'}).click();
 await expect(reveal).toHaveAttribute('data-reveal','full');
});
