import { test,expect } from '@playwright/test';
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
 await expect(page.locator('.app-skeleton-block').first()).toBeVisible();
 expect(await page.locator('.app-skeleton-block').count()).toBeGreaterThan(20);
 releaseAuth();
 await expect(page.getByRole('button',{name:/Go to Kraroktunngern/})).toBeVisible();
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
 await page.getByRole('button',{name:'ข้าม'}).click();
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
 for(let step=0;step<3;step++)await page.getByRole('button',{name:'ถัดไป'}).click();
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
 await page.getByRole('button',{name:/Go to Kraroktunngern/}).click();
 await page.locator('input[type=email]').first().fill(user.email);
 await page.locator('input[type=password]').first().fill('test-password-123');
 await page.locator('form button[type=submit]').first().click();
 await expect(page.getByText(user.email).first()).toBeVisible();
 const sidebar=page.locator('aside');
 await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'คุณคือใคร?'})).toHaveCount(0);
 await expect(page.getByText('วางแผนวันนี้ ให้เงินเติบโตทุกวัน')).toHaveCount(0);
 for(const action of ['เพิ่มรายรับ','เพิ่มรายจ่าย','เป้าหมายออม','ดูรายการ'])await expect(page.getByRole('button',{name:action})).toBeVisible();
 const quickPay=page.getByRole('button',{name:'รับเงินด่วน'});
 await quickPay.click();
 await expect(page.getByRole('heading',{name:'บันทึกรับเงินด่วน'})).toBeVisible();
 await expect(page.locator('.fixed.inset-0').locator('input[type=text]')).toBeVisible();
 await page.getByRole('button',{name:'ปิดหน้าต่างรับเงินด่วน'}).click();
 await page.getByRole('button',{name:/มูลค่างานตามสัญญา/}).click();
 const breakdownHeading=page.getByRole('heading',{name:/งานทั้งหมดของเดือน/});
 await expect(breakdownHeading).toBeVisible();
 await page.locator('.fixed.inset-0').click({position:{x:5,y:5}});
 await expect(breakdownHeading).toHaveCount(0);
 const tools=sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'});
 await tools.click();
 const names=await sidebar.locator('nav button').allTextContents();
 for(const name of names) {
  const button=sidebar.locator('nav button').filter({hasText:name.trim()}).first();
  if(name.includes('เครื่องมือเพิ่มเติม'))continue;
  if(await button.isVisible()) { await button.click();await expect(button).toHaveAttribute('aria-current','page');await expect(page.locator('#main-content')).not.toContainText('กำลังโหลด');await expect(page.getByText('โหลดหน้านี้ไม่สำเร็จ',{exact:true})).toHaveCount(0); }
 }
 await sidebar.getByRole('button',{name:'ตั้งค่าระบบ'}).click();
 await expect(page.getByRole('heading',{name:'โปรไฟล์ผู้ใช้'})).toBeVisible();
 await expect(page.getByText('SQ-1111111111',{exact:true}).first()).toBeVisible();
 await sidebar.locator('nav button').first().click();
 await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
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
 await expect(page.getByRole('button',{name:/Go to Kraroktunngern/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:/Go to Kraroktunngern/}).click();
 await expect(page.locator('input[type=email]').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/mobile-login.png',fullPage:true});
});

test('add-job sheet stays in the viewport and success feedback appears at the top',async({page})=>{
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:route.request().method()==='POST'?{ok:true}:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');
 await page.locator('aside').getByRole('button',{name:'บันทึกรายรับ-รายจ่าย'}).click();
 await page.getByRole('button',{name:/เพิ่มงานใหม่/}).click();
 const sheet=page.getByRole('heading',{name:'เพิ่มโปรเจกต์งานใหม่'}).locator('..').locator('..');
 await expect(sheet).toBeVisible();
 await expect.poll(async()=>{const box=await sheet.boundingBox();return box ? Math.round(box.y) : 9999;}).toBeLessThan(900);
 await expect.poll(async()=>{const box=await sheet.boundingBox();return box ? Math.round(box.y+box.height) : 9999;}).toBeLessThanOrEqual(900);
 expect(await sheet.evaluate(el=>el.closest('.fixed')?.parentElement===document.body)).toBe(true);

 await page.getByPlaceholder('เช่น รับเขียนบทความรีวิว / รีวิวลิปสติกแบรนด์ A').fill('Regression project');
 await page.getByRole('button',{name:'ขั้นตอนถัดไป'}).click();
 await page.getByPlaceholder('เช่น 30000').fill('1000');
 await page.getByRole('button',{name:'ขั้นตอนถัดไป'}).click();
 await expect(page.getByRole('button',{name:'บันทึกข้อมูลดีลงาน'})).toBeEnabled({timeout:2000});
 await page.getByRole('button',{name:'บันทึกข้อมูลดีลงาน'}).click();
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
 await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();
 await sidebar.getByRole('button',{name:'ผู้ช่วยจัดการภาษี'}).click();
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
 await page.goto('/');await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
 const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();
 await sidebar.getByRole('button',{name:'ออกบิล & ใบเสร็จ'}).click();
 await expect(page.getByRole('button',{name:'รายการเอกสารทั้งหมด (0)'})).toBeVisible();
 expect(saved.some(c=>c.table==='cashflow_invoices')).toBe(false);
 await page.getByRole('button',{name:'นำเข้าเอกสารเดิมจากเครื่อง'}).click();
 await page.getByRole('button',{name:'ตกลง',exact:true}).click();
 await expect.poll(()=>saved.filter(c=>c.table==='cashflow_invoices').length).toBe(1);
 expect(saved.find(c=>c.table==='cashflow_invoices')).toMatchObject({id:'legacy-invoice',version:null,op:'set'});
 await expect(page.getByRole('button',{name:'รายการเอกสารทั้งหมด (1)'})).toBeVisible();
});

test('invoice preview and print render the shared A4 document and the editor offers all five types',async({page,context})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'1234567890123',bankName:'KBank',bankAccount:'012-3-45678-9',bankAccountName:'Test issuer'};
 const invoice={id:'tax-1',documentType:'receiptTaxInvoice',documentNo:'RTX-2569-001',createdDate:'2026-09-17',issuer:profile,client:{name:'<b>Client</b>',address:'Bangkok',phone:'',email:'',taxId:'0105560123456',branch:'สำนักงานใหญ่'},items:[{id:'i1',description:'Design work',unit:'งาน',quantity:2,price:1000,discount:100}],vatRate:7,whtRate:0,paymentMethod:'โอนเงิน'};
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>route.fulfill({json:{snapshot:{...snapshot,invoices:[invoice]},versions:{...versions,cashflow_invoices:{'tax-1':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
 const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();
 await sidebar.getByRole('button',{name:'ออกบิล & ใบเสร็จ'}).click();
 const preview=page.getByTestId('document-preview');
 await expect(preview.getByRole('heading',{name:'ใบเสร็จรับเงิน/ใบกำกับภาษี'})).toBeVisible();
 await expect(preview).toContainText('(ต้นฉบับ)');
 await expect(preview).toContainText('1,900.00');
 await expect(preview).toContainText('2,033.00');
 await expect(preview).toContainText('สองพันสามสิบสามบาทถ้วน');
 await expect(preview.locator('b')).toHaveCount(0);
 const popupPromise=context.waitForEvent('page');
 await page.getByRole('button',{name:'พิมพ์ / บันทึกเป็น PDF'}).click();
 const popup=await popupPromise;
 await expect(popup.locator('.da4-page')).toHaveCount(1);
 await expect(popup.locator('.da4-page')).toContainText('2,033.00');
 expect(await popup.locator('b').count()).toBe(0);
 await popup.close();
 await page.getByRole('button',{name:'ออกเอกสารใหม่'}).click();
 const typeSelect=page.locator('select:has(option[value=taxInvoice])');
 await expect(typeSelect.locator('option')).toHaveCount(5);
 await typeSelect.selectOption('taxInvoice');
 await expect(page.getByPlaceholder('หน่วย')).toBeVisible();
 await expect(page.getByPlaceholder('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toBeVisible();
});

test('uploaded logo and signature are saved to the profile and appear on existing documents',async({page})=>{
 const profile={name:'Test issuer',address:'Bangkok',phone:'',email:'a@example.com',taxId:'',bankName:'',bankAccount:'',bankAccountName:''};
 const invoice={id:'old-1',documentType:'invoice',documentNo:'INV-OLD-001',createdDate:'2026-09-17',issuer:profile,client:{name:'Client',address:'',phone:'',email:'',taxId:''},items:[{id:'i1',description:'Work',quantity:1,price:100}],vatRate:0,whtRate:0};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGN4Fq/9Hx9mGBkKAFHYm8E0k7sPAAAAAElFTkSuQmCC','base64');
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 const saved:any[]=[];
 await page.route('**/api/data*',async route=>{
  if(route.request().method()==='POST'){saved.push(...route.request().postDataJSON().changes);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{snapshot:{...snapshot,invoices:[invoice]},versions:{...versions,cashflow_invoices:{'old-1':1}},subscription:{status:'active',current_period_end:'2027-01-01T00:00:00Z'}}});
 });
 await page.goto('/');await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
 const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();
 await sidebar.getByRole('button',{name:'ออกบิล & ใบเสร็จ'}).click();
 const preview=page.getByTestId('document-preview');
 await expect(preview).toContainText('INV-OLD-001');
 await expect(preview.locator('.da4-logo')).toHaveCount(0);
 await page.getByRole('button',{name:'ข้อมูลโปรไฟล์ของฉัน'}).click();
 const files=page.locator('input[type=file]');
 await expect(files).toHaveCount(3); // logo, banner, signature
 await files.nth(0).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
 await files.nth(2).setInputFiles({name:'sign.png',mimeType:'image/png',buffer:png});
 await expect(page.locator('img[src^="data:image"]')).toHaveCount(2);
 await page.getByLabel('ธนาคาร',{exact:true}).selectOption('ธนาคารกสิกรไทย');
 await page.getByPlaceholder('เช่น 123-4-56789-0').fill('012-3-45678-9');
 await page.getByRole('slider',{name:'ขนาดโลโก้บนเอกสาร'}).fill('152');
 await page.getByRole('button',{name:'ขวา',exact:true}).click();
 await page.getByRole('button',{name:/บันทึก/}).last().click();
 await page.getByRole('button',{name:'ตกลง',exact:true}).click();
 await expect.poll(()=>saved.some(c=>c.id==='issuer_profile'&&c.data.logoUrl?.startsWith('data:image')&&c.data.signatureUrl?.startsWith('data:image')&&c.data.logoHeight===152&&c.data.logoPosition==='right'&&c.data.bankName==='ธนาคารกสิกรไทย')).toBe(true);
 await expect(page.getByTestId('document-preview').locator('.da4-logo')).toHaveCount(1);
 await expect(page.getByTestId('document-preview').locator('.da4-chip')).toHaveText('KBANK');
 await expect(page.getByTestId('document-preview').locator('.da4-top.pos-right')).toHaveCount(1);
 expect(await page.getByTestId('document-preview').locator('.da4-logo').evaluate(el=>getComputedStyle(el).maxHeight)).toBe('152px');
 await expect(page.getByTestId('document-preview').locator('.da4-sig img')).toHaveCount(2); // signature + seller stamp (logo)
 await page.getByRole('button',{name:'ข้อมูลโปรไฟล์ของฉัน'}).click();
 await page.locator('input[type=file]').nth(1).setInputFiles({name:'banner.png',mimeType:'image/png',buffer:png});
 await page.getByRole('slider',{name:'ขนาดโลโก้บนเอกสาร'}).waitFor();
 await page.getByRole('button',{name:/บันทึก/}).last().click();
 await page.getByRole('button',{name:'ตกลง',exact:true}).click();
 await expect(page.getByTestId('document-preview').locator('.da4-banner')).toHaveCount(1);
 await expect(page.getByTestId('document-preview').locator('.da4-top .da4-logo')).toHaveCount(0);
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
 await page.goto('/');await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
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
 await page.goto('/');await expect(page.getByRole('heading',{name:'ภาพรวมกระแสเงินสด'})).toBeVisible();
 const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();await sidebar.getByRole('button',{name:'ออกบิล & ใบเสร็จ'}).click();
 await expect(page.getByText('INV-PRIVATE-A').first()).toBeVisible();
 switched=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByText(second.email).first()).toBeVisible();
 await expect(page.getByText('INV-PRIVATE-A')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'รายการเอกสารทั้งหมด (0)'})).toBeVisible();
});

test('a protected API 401 immediately removes private views without waiting for the session timer',async({page})=>{
 let denied=false;
 await page.route('**/api/auth',route=>route.fulfill({json:{session:{user}}}));
 await page.route('**/api/data*',route=>denied?route.fulfill({status:401,json:{error:'Session expired'}}):route.fulfill({json:{snapshot,versions,subscription:{status:'active',plan:'pro_monthly',current_period_end:'2027-01-01T00:00:00Z'}}}));
 await page.goto('/');await expect(page.locator('#dashboard-top')).toBeVisible();
 denied=true;const sidebar=page.locator('aside');await sidebar.getByRole('button',{name:'เครื่องมือเพิ่มเติม'}).click();await sidebar.getByRole('button',{name:'ออกบิล & ใบเสร็จ'}).click();
 await expect(page.locator('input[type=email]').first()).toBeVisible();await expect(page.locator('#main-content')).toHaveCount(0);
});
