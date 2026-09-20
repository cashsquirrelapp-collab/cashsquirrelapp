# Cash Squirrel — กระรอกตุนเงิน

เว็บจัดการรายรับ รายจ่าย เป้าหมายออม ภาษี และเอกสารการเงิน แยก frontend, backend และ database ใช้ TypeScript พร้อมตรวจชนิดข้อมูลแบบ strict

## โครงสร้าง

```text
frontend/
  src/app/            หน้าหลักและการเชื่อมฟีเจอร์
  src/features/       auth, dashboard, jobs, expenses, goals, invoices,
                      reports, tax, settings, onboarding, billing, groups
  src/components/     UI และ mascot ที่ใช้ร่วมกัน
  src/services/       API, auth และ cloud persistence
  src/i18n/           ภาษาไทย / อังกฤษ
  public/             PWA, LIFF, รูปภาพ และหน้าข้อกำหนด
  vite.config.ts      ตั้งค่า build ของ frontend
backend/
  src/handlers/       API ของแต่ละฟีเจอร์
  src/http/           router, error handling, CSRF และ security headers
  src/security/       session, encrypted cookies และ rate limiting
  src/repositories/   การอ่านและเขียนข้อมูลฐานข้อมูล
  src/services/       LINE, Gmail และ assistant
  src/config/         การอ่าน environment และ client ฝั่ง server
  src/server.ts       Express สำหรับ dev และ production
  scripts/            เตรียมประวัติ Stripe เป็น SQL เพื่อทบทวนก่อนใช้
shared/               domain types, validation, version diff, calendar, calculations
database/migrations/  schema, RLS, atomic functions และ legacy import
tests/                SQL, HTTP, security และ browser tests
api/index.ts          entry point บน Vercel ใช้ backend ชุดเดียวกัน
docs/                 architecture, security และคู่มือย้ายระบบ
```

## เริ่มในเครื่อง

ใช้ **Node.js 22.12 ขึ้นไป** และ npm ระบบ Supabase รุ่นนี้ใช้ WebSocket ของ Node 22 แม้แอปไม่ได้เปิด Realtime

```sh
npm ci
cp .env.example .env.local
npm run dev
```

เปิด `http://127.0.0.1:3000` ค่า `APP_URL` ต้องตรงกับ origin ที่ใช้เปิดหน้าเว็บ การใช้ `localhost` แทน `127.0.0.1` ต้องแก้ `APP_URL` ให้ตรงกัน โหมดทดลองใช้ได้โดยไม่ใส่ credentials; บัญชีจริงต้องใส่ Supabase และ `SESSION_SECRET` พร้อมใช้ migrations ก่อน

ข้อมูลการเงินที่ใช้งานอยู่เก็บในหน่วยความจำของหน้าและฐานข้อมูล ไม่เก็บ working copies ลง browser storage ข้อมูลที่ยัง sync ไม่สำเร็จควร export ก่อน reload/ปิดหน้า Session มีอายุสูงสุด 8 ชั่วโมง; production บังคับ HTTPS

Frontend เรียก `/api/*` บน origin เดียวกับเว็บ Backend เก็บ access/refresh token ใน cookie ที่เข้ารหัสและมี HttpOnly, SameSite; เมื่อใช้ HTTPS จะเพิ่ม Secure และชื่อแบบ `__Host-` หน้าเว็บไม่ได้รับ token หรือ service role key

## ฐานข้อมูลและบัญชีจริง

ฐานข้อมูลใช้ Supabase PostgreSQL; ไม่ต้องแยก database server เพิ่ม การแยก database ใน repo หมายถึงแยก schema, migrations และกฎสิทธิ์ออกจากหน้าเว็บและ API

1. สร้างหรือใช้ Supabase staging project ใส่ `SUPABASE_URL`, publishable key, service role key และ random `SESSION_SECRET` ใน environment ฝั่ง server
2. ใช้ `database/migrations/001_core.sql` **ครั้งเดียว** เพื่อสร้างตารางและ functions
3. ใช้ `002_import_legacy.sql` **ครั้งเดียว** ถ้ามีข้อมูล `user_cashflow_data` เดิม โดยหยุด writer เดิมก่อน คู่มือเต็มอยู่ใน [database/README.md](database/README.md)
4. ใช้ `003_security_hardening.sql`, `004_roles_groups.sql`, `005_group_finance.sql` และ `006_public_profiles.sql` แล้วรัน `database/security-check.sql`; เพิ่ม role ระบบ กลุ่ม การเงินกลุ่ม และโปรไฟล์สาธารณะที่ไม่เปิดเผยอีเมล
5. ตั้ง Supabase Auth Site URL เป็น `APP_URL` และเพิ่ม redirect URL `<APP_URL>/api/auth` ตั้ง Google provider หากต้องการ
6. เปิด email confirmation และจัด SMTP ของ Supabase สำหรับอีเมลสมัครสมาชิก ฟีเจอร์ LINE reset ใช้รหัสอีกระบบหนึ่ง

**ยังไม่ได้รัน migrations กับฐานข้อมูลจริงหรือ deploy** การทดสอบใน repo ใช้ PostgreSQL ใน PGlite และ external service mocks ต้องทดสอบบน staging ด้วย credentials จริงก่อน cutover

## Role และกลุ่ม

เปิดเมนู **กลุ่ม & สมาชิก** ด้วยบัญชีจริง ผู้ใช้ทุกคนเริ่มเป็น `user` และสร้างกลุ่มได้ ผู้สร้างเป็น `leader` (หัวหน้า) อัตโนมัติ สมาชิกใหม่เป็น `member` (ลูกน้อง) หัวหน้าเชิญด้วยอีเมล ผู้รับต้องยืนยันอีเมลแล้วกดรับคำเชิญในบัญชีของตัวเองภายใน 7 วัน คำเชิญนี้แสดงในเว็บ ไม่ได้ส่งอีเมลแจ้งเตือนแยก

หัวหน้าเพิ่ม/ลดสิทธิ์ นำสมาชิกออก แก้ไข/ลบกลุ่ม และโอนตำแหน่งได้ มีหัวหน้าได้หลายคน การโอนให้สมาชิกคนอื่นทำให้ผู้โอนกลับเป็นลูกน้อง กลุ่มต้องเหลือหัวหน้าอย่างน้อยหนึ่งคนก่อนออกจากกลุ่มหรือลดสิทธิ์ `admin` ดูแลทุกกลุ่มและจัดการ role ระบบได้ การเป็นหัวหน้ากลุ่มไม่ทำให้เป็น admin และกลุ่มไม่เปิดเผยข้อมูลการเงินส่วนตัวของสมาชิก

บัญชีมีชื่อแสดงผลที่แก้ได้และ User ID รูปแบบ `SQ-XXXXXXXXXX` ที่แก้ไม่ได้ การค้นหาและเชิญสมาชิกใช้ชื่อหรือ User ID และ API กลุ่มไม่ส่งอีเมลสมาชิกออกไปยังหน้าเว็บ ชื่ออาจซ้ำกันได้จึงต้องตรวจ User ID ก่อนส่งคำเชิญ

หากฐานข้อมูลมี 001–003 อยู่แล้ว ให้ใช้เฉพาะ **004** สำหรับฟีเจอร์นี้ ก่อนกำหนด admin คนแรก สมัครและยืนยันอีเมลบัญชีที่ต้องการ จากนั้นทบทวน [database/bootstrap-admin.sql](database/bootstrap-admin.sql) เปลี่ยน UUID ให้ตรงกับ `auth.users.id` แล้วรันด้วยสิทธิ์ postgres/migration บัญชีแรกที่สมัครจะไม่ได้เป็น admin อัตโนมัติ ต่อจากนั้นเปลี่ยน role ผ่านหน้า **จัดการผู้ใช้** ของ admin คู่มือและตารางสิทธิ์อยู่ใน [database/README.md](database/README.md)

## ตรวจงาน

```sh
npm run lint        # TypeScript strict
npm test            # SQL / RLS / auth cookie / CSRF / HTTP / webhook
npm run build       # build/frontend + build/backend
npx playwright install chromium
npm run test:e2e    # production server + mock external APIs
npm audit
```

`npm run preview` ตรวจได้เฉพาะ static frontend; ใช้ `npm run dev` หรือ `npm start` เพื่อใช้ API สคริปต์ CI ตรวจ lint, tests, build, browser tests และ audit

## Production

### Vercel

ใช้ project root นี้เป็น root directory ตั้ง runtime Node 22 และ environment ฝั่ง server ตาม `.env.example` ตั้ง `APP_URL` เป็น HTTPS domain จริง `vercel.json` ระบุ build/output, rewrites, headers และ cron ไว้แล้ว API ทั้งหมดแชร์ `api/index.ts` หนึ่ง function เพื่อให้เส้นทางและ body parsing ตรงกับ Express

Stripe webhook: `/api/stripe-webhook`; LINE webhook: `/api/line-webhook`; LIFF endpoint: `/liff-add.html` ต้องใส่ `STRIPE_PRO_PAYMENT_LINK_ID` ให้ตรงกับ `VITE_PRO_PAYMENT_URL` ระบบจะให้สิทธิ์เฉพาะ payment link ที่กำหนด ยอด 149 THB และ payment ที่ยืนยันว่าจ่ายแล้ว

หากย้ายระบบที่มีสมาชิก Pro อยู่แล้ว ให้เตรียมประวัติด้วย `npm run billing:backfill` ทบทวน SQL ที่สร้าง แล้ว apply ก่อนเปิด webhooks คู่มือระบุการตรวจยอดและวันหมดอายุ

### Node server / container

```sh
npm ci
npm run build
HOST=0.0.0.0 PORT=3000 npm start
```

ให้ reverse proxy หรือ platform ดูแล HTTPS และตั้ง `APP_URL` เป็น public origin อย่าเปิด HTTP server นี้ออกอินเทอร์เน็ตโดยไม่มี TLS สคริปต์ตัวอย่างไม่ได้ deploy หรือเปิดพอร์ตให้เอง

## เอกสารเพิ่มเติม

- [ภาพสถาปัตยกรรมและเส้นทางข้อมูล](docs/ARCHITECTURE.md)
- [สิ่งที่แก้ด้านความปลอดภัยและข้อจำกัด](docs/SECURITY.md)
- [ลำดับย้ายฐานข้อมูลและตรวจข้อมูลเดิม](database/README.md)
- [รายงานตรวจโปรเจคเดิม](docs/SECURITY_REVIEW_BEFORE.md)

## การเงินส่วนตัวและกลุ่ม

หลังใช้ migration 001–004 แล้ว ให้รัน `database/migrations/005_group_finance.sql` และ `database/security-check.sql` ใน Supabase SQL Editor จากนั้นเลือก **บัญชีการเงิน** ด้านบนของเว็บเป็น **ส่วนตัว** หรือกลุ่มที่เป็นสมาชิก รายรับ รายจ่าย เป้าหมาย ตั้งค่าการเงิน ภาษี เอกสาร/ผู้ออกเอกสาร รายงาน และไฟล์สำรองใช้บัญชีที่เลือกทั้งหมด สมาชิกทุกคนดูและแก้ไขการเงินร่วมกันได้ สิทธิ์จัดการสมาชิกยังเป็นของหัวหน้า/admin ตามเดิม

ข้อมูลเดิมยังเป็นส่วนตัว กลุ่มใหม่เริ่มด้วยบัญชีว่าง ไม่มีการคัดลอกข้อมูลส่วนตัวให้สมาชิกกลุ่มโดยอัตโนมัติ สลับบัญชีจะบันทึกข้อมูลเดิมก่อนและหยุดการสลับหากบันทึกไม่สำเร็จ ไฟล์สำรองระบุบัญชีต้นทาง การนำเข้าจะลงบัญชีที่เลือกอยู่ สมาชิกอื่นแก้รายการเดียวกันจะตอบ conflict แทนเขียนทับ ให้สำรองก่อนโหลดข้อมูลล่าสุด การรีเฟรชรายชื่อกลุ่มใช้ปุ่มข้างตัวเลือกบัญชี

รูปโปรไฟล์ แพ็กเกจ Pro การเชื่อม LINE และการส่งรายงานอัตโนมัติยังผูกบัญชีผู้ใช้ส่วนตัว รายงานของกลุ่มสร้าง/ดาวน์โหลด/ส่งทางอีเมลจากหน้ารายงานที่เลือกกลุ่มได้ ไม่มีการส่งข้อมูลกลุ่มเข้า LINE ส่วนตัวอัตโนมัติ
