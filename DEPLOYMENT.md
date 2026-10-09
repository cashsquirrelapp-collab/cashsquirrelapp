# คู่มือนำ Cash Squirrel ขึ้นเว็บจริง

แพ็กเกจนี้พร้อมใช้กับ **Vercel** ผ่าน `vercel.json` และ `api/index.ts` ต้องใช้ Node.js 22.12 ขึ้นไป

## 1. เตรียมฐานข้อมูล

โปรเจค Supabase ต้อง apply ไฟล์ใน `database/migrations` ตามลำดับเลข ปัจจุบันถึง `020_stripe_subscriptions.sql` แล้วรัน `database/security-check.sql` และต้องขึ้น `Success` สำหรับฐานข้อมูลเดิมให้ apply เฉพาะไฟล์เลขที่ยังไม่เคยรัน ห้ามรัน migration เก่าซ้ำโดยเดาเอง

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

## 3. ตั้ง Stripe Pro ฿149/เดือน

ทดสอบใน Stripe Sandbox/Test mode ก่อนเสมอ โดย Product ต้องมีราคา recurring ทุก 1 เดือน สกุล THB จำนวน 14900 สตางค์ และใช้ Price ID ที่ขึ้นต้นด้วย `price_` จาก mode เดียวกับ Secret key

ตั้งค่าใน Vercel เฉพาะ Preview ก่อน:

```text
STRIPE_SECRET_KEY=Test secret key (backend only)
STRIPE_PRO_PRICE_ID=Test recurring Price ID
STRIPE_WEBHOOK_SECRET=Signing secret ของ Preview webhook endpoint
```

สร้าง webhook endpoint ไปที่ `https://PREVIEW_DOMAIN/api/stripe-webhook` และเลือกเหตุการณ์:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

เปิด Customer Portal ใน Stripe test mode เพื่อให้สมาชิกเปลี่ยนวิธีชำระเงินหรือยกเลิกได้ จากนั้นทดสอบ Checkout ด้วยบัญชีทดสอบ ตรวจว่า webhook ตอบ 2xx และแถว `subscriptions` เปลี่ยนตามสถานะ Stripe จริง หน้า `?checkout=success` เป็นเพียงหน้ารอผลและต้องไม่ให้สิทธิ์ Pro เอง

เมื่อ test mode ผ่านครบแล้ว จึงตั้งตัวแปรสามตัวเดียวกันใน Vercel Production โดยใช้ Live secret key, Live Price ID และ signing secret ของ webhook endpoint ฝั่ง Live ห้ามผสมค่า test/live และห้ามนำ secret ใส่ตัวแปรที่ขึ้นต้น `VITE_`

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
- ยกเลิกผ่าน Customer Portal แล้วสิทธิ์ยังอยู่ถึงสิ้นรอบ จากนั้นถูกปิดตาม `customer.subscription.deleted`

Admin คนแรกยังไม่ได้กำหนด ให้สมัครและยืนยันบัญชีที่ต้องการก่อน แล้วใช้ `database/bootstrap-admin.sql` โดยใส่ UUID ของบัญชีนั้นและรันด้วย trusted migration role
