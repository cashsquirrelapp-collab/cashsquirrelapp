# Project Handoff — Cash Squirrel

เอกสารนี้สำหรับเจ้าของระบบ/ผู้รับช่วงพัฒนาและ deploy โปรเจคต่อ

## สถานะที่ส่งมอบ

- Frontend: React + Vite
- Backend: Express API/BFF ใช้ HttpOnly encrypted session cookie
- Database/Auth/Storage: Supabase PostgreSQL
- Deployment config: Vercel (`vercel.json`, `api/index.ts`)
- Node.js: 22.12 ขึ้นไป
- Database migrations: 001–005
- Roles: system `admin/user`, group `leader/member`
- การเงินเลือก scope ส่วนตัวหรือกลุ่ม สมาชิกกลุ่มทุกคนอ่านและแก้ไขข้อมูลกลุ่มได้
- การจัดการสมาชิกยังจำกัดเฉพาะ leader/admin
- SQL/API/security tests, TypeScript และ production build ผ่านก่อนสร้างแพ็กเกจ

## สิ่งที่ไม่มีในแพ็กเกจ

ไม่มี API key, password, `.env.local`, access token, refresh token, user data, build output หรือ dependency cache เจ้าของระบบต้องกำหนด credentials ในระบบ hosting เอง

## เริ่มพัฒนาต่อในเครื่อง

```sh
cp .env.example .env.local
npm ci
npm run dev
```

เติมค่าจริงใน `.env.local` และห้าม commit ไฟล์นี้ ต้องใช้ Node.js 22.12 ขึ้นไป

คำสั่งตรวจมาตรฐาน:

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

## เชื่อม Supabase

ถ้าใช้ **Supabase project ใหม่** ให้รัน SQL ใน `database/migrations/` ตามลำดับ 001 ถึง 005 แล้วรัน `database/security-check.sql`

ถ้าใช้ **Supabase project เดิมของโปรเจคนี้** และมี migration 001–005 แล้ว ไม่ต้องรันซ้ำ ให้รันเฉพาะ `database/security-check.sql` เพื่อยืนยันสถานะ

Environment ที่ต้องใช้:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` เป็น backend secret ห้ามใส่ใน source, Vite variable, browser หรือ repository

## สิ่งที่เจ้าของระบบต้องตัดสินใจก่อนเปิดจริง

1. ตั้ง Custom SMTP ใน Supabase สำหรับ verification email; default SMTP จำกัดผู้รับและโควตาต่ำ
2. ตั้ง production domain ใน Supabase Auth URL Configuration
3. เลือกบัญชี admin คนแรก แล้วใช้ `database/bootstrap-admin.sql` หลังยืนยันอีเมล
4. เปิด Google Login เฉพาะเมื่อสร้าง Google OAuth Client และตั้ง provider ใน Supabase แล้ว
5. ใส่ Stripe, LINE, Gmail และ Anthropic credentials เฉพาะฟีเจอร์ที่จะเปิดใช้
6. ตั้ง CAPTCHA/rate limits ให้เหมาะกับจำนวนผู้ใช้ก่อนเปิดรับสมัครสาธารณะ

Google OAuth, Custom SMTP และ admin คนแรกยังไม่ได้ผูกใน source เพราะทั้งหมดเป็นการตั้งค่าของเจ้าของระบบ

## Deploy

ทำตาม [DEPLOYMENT.md](DEPLOYMENT.md) ใช้ Vercel ได้โดยตรง Environment ขั้นต่ำคือ:

```text
APP_URL=https://production-domain.example
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SESSION_SECRET=...
```

สร้าง `SESSION_SECRET` ใหม่สำหรับ production ห้ามใช้ค่าจากเครื่องผู้พัฒนา การเปลี่ยนค่านี้ภายหลังจะทำให้ session เดิมออกจากระบบ

## จุดสำคัญสำหรับผู้พัฒนาต่อ

- Browser ไม่คุยฐานข้อมูลโดยตรง การเงินและกลุ่มผ่าน same-origin `/api/*`
- ทุก mutation ตรวจ Origin + CSRF header + authenticated cookie + account binding
- Group finance ตรวจ membership ซ้ำใน database RPC และไม่ให้ system admin อ่านข้อมูลกลุ่มหากไม่ได้เป็นสมาชิก
- การบันทึกใช้ version compare-and-set; HTTP 409 หมายถึงต้องสำรอง working copy และโหลดข้อมูลล่าสุด
- LINE และ automatic email reports ยังเป็นระดับบัญชีส่วนตัว ไม่ส่งข้อมูลกลุ่มเข้า LINE อัตโนมัติ
- ข้อมูลการเงินไม่มี realtime subscription สมาชิกต้องโหลดข้อมูลล่าสุดเพื่อเห็นการแก้จากคนอื่น
- รายละเอียด architecture และ security อยู่ใน `docs/ARCHITECTURE.md` และ `docs/SECURITY.md`

## Checklist หลัง deploy

- [ ] HTTPS และ `APP_URL` ตรงกับ origin จริง
- [ ] Supabase Site URL และ Redirect URL `/api/auth` ถูกต้อง
- [ ] `database/security-check.sql` ผ่าน
- [ ] ไม่พบ secret ใน frontend bundle หรือ Git history
- [ ] สมัคร ยืนยันอีเมล เข้าสู่ระบบ และ logout ได้
- [ ] สร้างกลุ่ม เชิญสมาชิก รับคำเชิญ และโอนหัวหน้าได้
- [ ] สลับการเงินส่วนตัว/กลุ่มแล้วข้อมูลไม่ปนกัน
- [ ] สมาชิกที่ถูกเตะถูกปฏิเสธการเงินกลุ่มทันที
- [ ] ตั้ง admin คนแรกโดยใช้ UUID ที่ตรวจแล้ว
- [ ] ตั้ง backup, log monitoring และ alert ของ production

