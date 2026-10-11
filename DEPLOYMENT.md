# คู่มือนำ Cash Squirrel ขึ้นเว็บจริง

แพ็กเกจนี้พร้อมใช้กับ **Vercel** ผ่าน `vercel.json` และ `api/index.ts` ต้องใช้ Node.js 22.12 ขึ้นไป

## 1. เตรียมฐานข้อมูล

โปรเจค Supabase ต้อง apply ไฟล์ใน `database/migrations` ตามลำดับเลข ปัจจุบันถึง `023_preserve_manual_subscription_entitlements.sql` แล้วรัน `database/security-check.sql` และต้องขึ้น `Success` สำหรับฐานข้อมูลเดิมให้ apply เฉพาะไฟล์เลขที่ยังไม่เคยรัน ห้ามรัน migration เก่าซ้ำโดยเดาเอง

## 2. สร้างโปรเจคบน Vercel

1. แตก ZIP และนำโฟลเดอร์ขึ้น Git repository ส่วนตัว
2. Import repository เข้า Vercel
3. Framework Preset ใช้ `Other`; Vercel จะอ่าน build และ routes จาก `vercel.json`
4. ตั้ง Node.js เป็น 22.x
5. ตั้ง Environment Variables ก่อน Deploy

ค่าที่จำเป็น:

```text
APP_URL=https://your-domain.example
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=ค่าจาก Supabase
SUPABASE_SERVICE_ROLE_KEY=Secret key สำหรับ backend เท่านั้น
SESSION_SECRET=ข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร
```

สร้าง `SESSION_SECRET` ในเครื่องของผู้ deploy:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

อย่าตั้งชื่อ Secret key ด้วย `VITE_` และอย่า commit `.env`, `.env.local` หรือค่าจริงลง Git ค่า optional สำหรับ Stripe, LINE, Gmail, cron และ Anthropic ดูชื่อทั้งหมดใน `.env.example`; ฟีเจอร์นั้นจะยังไม่เปิดถ้าไม่ได้ตั้งค่า

## 3. ตั้ง Stripe Pro ฿199 ใน 3 รอบแรก จากนั้น ฿249/เดือน

ทดสอบใน Stripe Sandbox/Test mode ก่อนเสมอ โดยสร้าง Product หนึ่งรายการพร้อมราคา recurring ทุก 1 เดือน สกุล THB จำนวน 24900 สตางค์ จากนั้นสร้าง Coupon แบบลดจำนวนคงที่ 5000 สตางค์ สกุล THB ระยะเวลา repeating 3 เดือน และจำกัด Coupon ให้ใช้กับ Product นี้เท่านั้น ไม่ต้องสร้างราคา ฿199 แยก ระบบจะใช้ราคา ฿249 ลบส่วนลด ฿50 ใน 3 รอบบิลแรก แล้วเรียกเก็บราคาเต็มตั้งแต่รอบที่ 4 โปรโมชันใช้ได้หนึ่งครั้งต่อบัญชี

โค้ดตรวจ Price และ Coupon กับ Stripe ก่อนสร้าง Checkout และปฏิเสธแบบ fail closed หากสกุลเงิน จำนวน รอบบิล Product ระยะเวลาส่วนลด หรือ test/live mode ไม่ตรงตามนี้

ตั้งค่าใน Vercel เฉพาะ Preview ก่อน:

```text
STRIPE_MODE=test
STRIPE_SECRET_KEY=Test secret key (backend only)
STRIPE_PRO_PRICE_ID=Test recurring ฿249 Price ID
STRIPE_PRO_INTRO_COUPON_ID=Test Coupon ID (ลด ฿50 นาน 3 เดือน)
STRIPE_BILLING_PORTAL_CONFIGURATION_ID=Test Portal Configuration ID
STRIPE_WEBHOOK_SECRET=Signing secret ของ Preview webhook endpoint
```

รายการ Sandbox ที่ตรวจสอบไว้สำหรับโปรเจคนี้ (ไม่ใช่ Live IDs):

```text
Product: prod_VPqbSIzvtco17v
STRIPE_PRO_PRICE_ID=price_1UP0u0C4uZ5mcDl1i6PwxYzQ
STRIPE_PRO_INTRO_COUPON_ID=3mW3wzVD
```

Product ID ใช้สำหรับตรวจใน Dashboard เท่านั้น ไม่ต้องเพิ่มเป็น environment variable ห้ามนำ IDs ชุด Sandbox นี้ไปใช้กับ `STRIPE_MODE=live`

สร้าง webhook endpoint ไปที่ `https://PREVIEW_DOMAIN/api/stripe-webhook` และเลือกเหตุการณ์:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.finalization_failed
charge.refunded
```

สร้าง Customer Portal Configuration แยกใน Stripe test mode โดยเปิดการอัปเดตวิธีชำระเงินเพื่อให้ผู้ใช้แก้ปัญหา `past_due` ได้ เปิดการยกเลิกแบบมีผลเมื่อสิ้นรอบ (`at_period_end`) โดยไม่ prorate และปิดการเปลี่ยนแพ็กเกจหรือราคา แล้วใส่ ID ใน `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` ก่อนเปิด Portal ต้องตรวจใน Dashboard ว่าการตั้งค่าเหล่านี้ยังเปิดอยู่ โค้ดจะตรวจว่า configuration ยัง active, อยู่ mode เดียวกัน และนโยบายการยกเลิก/เปลี่ยนแพ็กเกจตรงตามที่รองรับ หากไม่ตรงจะปฏิเสธแบบ fail closed

จากนั้นทดสอบ Checkout ด้วยบัญชีทดสอบ ตรวจว่า webhook ตอบ 2xx และแถว `subscriptions` เปลี่ยนตามสถานะ Stripe จริง หน้า `?checkout=success` เป็นเพียงหน้ารอผลและต้องไม่ให้สิทธิ์ Pro เอง แพ็กเกจแบบชำระเงินเริ่มคิดเงินทันทีเมื่อ Checkout สำเร็จและไม่มี Stripe trial เพิ่มเติม (สิทธิ์ทดลองใช้แอปที่แสดงแยกต่างหากไม่เลื่อนวันเริ่มคิดเงิน)

Vercel Preview/Test Stripe ต้องเชื่อมกับ Supabase staging ที่แยกจาก production เท่านั้น เพราะ mode และ Stripe Customer binding ถูกบันทึกถาวรต่อบัญชี ระบบตั้งใจปฏิเสธการสลับ test/live บนแถวบัญชีเดิม ห้ามใช้ฐานข้อมูล production ทดสอบ Checkout หรือ webhook

### ประตูอนุมัติก่อนเปิด Live

- เจ้าของธุรกิจต้องยืนยันกติกาโปรโมชันว่าใช้ได้หนึ่งครั้งต่อ **บัญชี Cash Squirrel** ที่มีสิทธิ์ ไม่ใช่หนึ่งครั้งต่อบัตร อีเมล หรือ Stripe Customer หากยังไม่ยืนยันนิยามนี้ ห้ามเปิดแพ็กเกจ Live
- ใช้ Stripe Test Clock กับ subscription ทดสอบและตรวจ Invoice จริงให้ครบ: รอบที่ 1–3 ยอดรวมรอบละ ฿199 และรอบที่ 4 ยอดรวม ฿249 โดยไม่มี trial หรือส่วนลดเกิน 3 รอบ ห้ามเปิด Live จากการตรวจ Checkout รอบแรกเพียงอย่างเดียว
- ตรวจ migration ledger ของ production ว่าทุก migration ถูก apply ตามลำดับ และยืนยันการอัปเกรด ledger/migration 023 สำเร็จแล้ว หากฐานข้อมูลใช้ 020/021 แล้ว ให้ใช้ forward migration 022–023 เพื่อแก้ Checkout ของบัญชีที่ไม่มีสิทธิ์เดิม (ค่า NULL) 023 แยกสิทธิ์ pro_manual ออกจากยอดชำระ ฿149 เพื่อไม่ให้ webhook/refund เก่าลดสิทธิ์ที่ให้ไว้ ห้ามรัน migration เก่าซ้ำหรือเปิด recurring Live ก่อนตรวจครบ

### Runbook ตัดระบบ Live จาก Payment Link เดิม

1. ทำ inventory ของ Stripe Live ก่อนแก้ไข โดยบันทึก Product, Price, Payment Link, Checkout Session, Customer และ Subscription ที่เกี่ยวข้อง พร้อม mapping ไปยังบัญชีแอปที่ตรวจสอบได้
2. แถว Customer/Subscription ราคา ฿39 ที่มีอยู่ใน Live ต้องมีคำตัดสินรายแถวที่ได้รับอนุมัติว่าจะ `adopt`, `cancel` หรือ `map` เข้าบัญชีแอปใด ห้ามตีตราเป็นสิทธิ์ legacy แบบจ่ายครั้งเดียว ห้ามย้ายหรือยกเลิกเงียบ ๆ และห้ามปล่อยให้แถวที่ยังต่ออายุได้ไม่มีเจ้าของ
3. Archive/deactivate Payment Link ฿149 เดิมเพื่อหยุดการเปิด Checkout ใหม่ แต่เก็บ `STRIPE_LEGACY_PAYMENT_LINK_ID` ไว้ใน backend สำหรับตรวจสอบประวัติ คืนเงิน และกระทบยอด ห้ามลบประวัติการชำระเงินเดิม
4. รอให้ Checkout Session เดิมที่ยัง `open` จบหรือหมดอายุตามขั้นตอนที่ได้รับอนุมัติ แล้วตรวจจาก Stripe ว่าไม่เหลือ session แบบ `open` ของ Payment Link เดิมก่อนเปิด recurring Checkout
5. ทบทวนผล `npm run billing:backfill`, mapping, วันหมดอายุ และยอดเงินทั้งหมดก่อน apply SQL หรือเปิด Live webhook การ cutover นี้ต้องไม่เรียกเก็บเงิน ย้าย หรือยกเลิกลูกค้าเดิมโดยอัตโนมัติ

เมื่อผ่านประตูอนุมัติและ runbook ครบแล้ว ให้สร้าง Product, ราคา ฿249, Coupon ลด ฿50 นาน 3 เดือน และ Portal Configuration ขึ้นใหม่ใน Stripe Live mode แล้วจึงตั้งค่าทั้งหกตัวใน Vercel Production โดยใช้ `STRIPE_MODE=live`, Live secret key, Live Price ID, Live Coupon ID, Live Portal Configuration ID และ signing secret ของ webhook endpoint ฝั่ง Live ห้ามผสมค่า test/live และห้ามนำ secret ใส่ตัวแปรที่ขึ้นต้น `VITE_`

## 4. ตั้ง Supabase Auth

ใน Supabase → Authentication → URL Configuration:

```text
Site URL: https://your-domain.example
Redirect URL: https://your-domain.example/api/auth
```

เพิ่ม URL ของ Vercel Preview แยกเฉพาะเมื่อต้องใช้ทดสอบ login บน preview ไม่ควรใช้ wildcard กว้างกับ production

ก่อนรับผู้ใช้จริง ให้ตั้ง Custom SMTP ใน Supabase และคงการยืนยันอีเมลไว้ Default SMTP ใช้เพื่อทดลองเท่านั้น มีข้อจำกัดผู้รับและโควตาต่ำ

## 5. Build และตรวจในเครื่อง

```sh
npm ci
npm run check
npm run build
```

สำหรับเครื่อง/VPS ที่ไม่ได้ใช้ Vercel:

```sh
NODE_ENV=production npm start
```

ต้องวาง reverse proxy HTTPS ไว้ด้านหน้า และตั้ง `APP_URL` ให้ตรง origin จริงทุกตัวอักษร

## 6. ตรวจหลัง Deploy

- `/` เปิดได้ผ่าน HTTPS และ response มี security headers
- สมัคร/เข้าสู่ระบบแล้ว callback กลับ `/api/auth` สำเร็จ
- สร้างกลุ่ม เชิญสมาชิก และเลือกบัญชีการเงินส่วนตัว/กลุ่มได้
- ข้อมูลกลุ่มไม่ปรากฏเมื่อเลือกส่วนตัว
- สมาชิกที่ถูกนำออกจากกลุ่มอ่านหรือแก้ข้อมูลการเงินกลุ่มไม่ได้
- ไม่พบ `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, access token หรือ refresh token ใน HTML, JavaScript bundle, browser storage หรือ Git history
- Checkout สร้างจาก backend ด้วยบัญชีที่ล็อกอินอยู่, webhook ที่ลายเซ็นไม่ถูกต้องถูกปฏิเสธ และ event เดิมไม่เพิ่มสิทธิ์ซ้ำ
- Stripe Test Clock ยืนยันว่า invoice รอบที่ 1, 2 และ 3 มียอดรวม ฿199 ต่อรอบ และรอบที่ 4 มียอดรวม ฿249 โดยไม่มี trial หรือส่วนลดต่อหลังรอบที่ 3
- renewal สำเร็จ/ล้มเหลว, `customer.subscription.created/updated/deleted` และ webhook ซ้ำเปลี่ยนสิทธิ์และยอด paid-through อย่างถูกต้องโดยไม่ประมวลผลซ้ำ
- Customer Portal อัปเดตวิธีชำระเงินเพื่อกู้สถานะ `past_due` ได้ ปิดการเปลี่ยนแพ็กเกจ และยกเลิกแบบมีผลเมื่อสิ้นรอบโดยไม่ prorate
- ยกเลิกผ่าน Customer Portal แล้วสิทธิ์ยังอยู่ถึงสิ้นรอบ จากนั้นถูกปิดตาม `customer.subscription.deleted`; การพัก/ปิดบัญชีและ admin grant/revoke ต้องถูกบล็อกจน Stripe ยืนยันสถานะปลายทางแล้ว
- ผู้ใช้สิทธิ์ Pro แบบชำระครั้งเดียว ฿149 เดิมยังใช้ได้ถึงวันหมดอายุเดิม ไม่ถูกเปลี่ยนเป็นต่ออายุอัตโนมัติ และไม่เสียสิทธิ์จาก webhook ที่ไม่เกี่ยวข้อง
- migration ledger ยืนยันการอัปเกรดถึง 023 แล้ว, Payment Link ฿149 ถูกปิด, ไม่เหลือ legacy Checkout Session แบบ `open` และรายการ ฿39 ทุกแถวมีคำตัดสินที่ตรวจสอบย้อนหลังได้

Admin คนแรกยังไม่ได้กำหนด ให้สมัครและยืนยันบัญชีที่ต้องการก่อน แล้วใช้ `database/bootstrap-admin.sql` โดยใส่ UUID ของบัญชีนั้นและรันด้วย trusted migration role
