# คู่มือนำ Cash Squirrel ขึ้นเว็บจริง

แพ็กเกจนี้พร้อมใช้กับ **Vercel** ผ่าน `vercel.json` และ `api/index.ts` ต้องใช้ Node.js 22.12 ขึ้นไป

## 1. เตรียมฐานข้อมูล

โปรเจค Supabase ต้อง apply ไฟล์ตามลำดับ:

1. `database/migrations/001_core.sql`
2. `database/migrations/002_import_legacy.sql`
3. `database/migrations/003_security_hardening.sql`
4. `database/migrations/004_roles_groups.sql`
5. `database/migrations/005_group_finance.sql`
6. รัน `database/security-check.sql` และต้องขึ้น `Success`

ฐานข้อมูลที่เจ้าของโปรเจคเตรียมไว้ได้ apply 001–005 และตรวจ security แล้ว ไม่ต้องรันซ้ำหากใช้ Supabase project เดิม

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

## 3. ตั้ง Supabase Auth

ใน Supabase → Authentication → URL Configuration:

```text
Site URL: https://your-domain.example
Redirect URL: https://your-domain.example/api/auth
```

เพิ่ม URL ของ Vercel Preview แยกเฉพาะเมื่อต้องใช้ทดสอบ login บน preview ไม่ควรใช้ wildcard กว้างกับ production

ก่อนรับผู้ใช้จริง ให้ตั้ง Custom SMTP ใน Supabase และคงการยืนยันอีเมลไว้ Default SMTP ใช้เพื่อทดลองเท่านั้น มีข้อจำกัดผู้รับและโควตาต่ำ

## 4. Build และตรวจในเครื่อง

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

## 5. ตรวจหลัง Deploy

- `/` เปิดได้ผ่าน HTTPS และ response มี security headers
- สมัคร/เข้าสู่ระบบแล้ว callback กลับ `/api/auth` สำเร็จ
- สร้างกลุ่ม เชิญสมาชิก และเลือกบัญชีการเงินส่วนตัว/กลุ่มได้
- ข้อมูลกลุ่มไม่ปรากฏเมื่อเลือกส่วนตัว
- สมาชิกที่ถูกนำออกจากกลุ่มอ่านหรือแก้ข้อมูลการเงินกลุ่มไม่ได้
- ไม่พบ `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, access token หรือ refresh token ใน HTML, JavaScript bundle, browser storage หรือ Git history

Admin คนแรกยังไม่ได้กำหนด ให้สมัครและยืนยันบัญชีที่ต้องการก่อน แล้วใช้ `database/bootstrap-admin.sql` โดยใส่ UUID ของบัญชีนั้นและรันด้วย trusted migration role

