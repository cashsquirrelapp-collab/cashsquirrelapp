# Database migration runbook

ใช้ Supabase PostgreSQL เดิมได้ ไม่ได้ใช้ฐานข้อมูลจาก browser โดยตรง Migration เป็น SQL แบบ transaction ใช้ **ครั้งเดียว** และไม่แก้ production ให้อัตโนมัติ

## Fresh install

1. สำรอง/เลือก Supabase staging project และเปิด SQL editor ด้วยสิทธิ์ migration/postgres
2. Apply `migrations/001_core.sql` แล้ว `002_import_legacy.sql`, `003_security_hardening.sql` และ `004_roles_groups.sql`; ถ้าไม่มีตารางเดิม import จะข้าม จากนั้นรัน `security-check.sql`
3. ตั้ง environment ฝั่ง backend และ Auth callback ตาม root README
4. ตรวจ login/load/save/logout/LINE reset ด้วยบัญชีทดสอบสองบัญชี ก่อนเปลี่ยน production

## ย้ายจาก user_cashflow_data

1. สำรอง database ทั้ง schema และ data พร้อม export ข้อมูลสำคัญจาก browser มี rollback deployment เก็บไว้
2. เปิด maintenance/หยุด old frontend writer, LINE webhook, cron และ Stripe webhook ระหว่าง cutover ไม่ให้ระบบเก่าแก้ array หลัง backfill
3. ตรวจ legacy JSON ว่าแต่ละรายการมี string id ที่ไม่ซ้ำในบัญชี, money เป็น finite non-negative number, settings/prefs เป็นชนิดข้อมูลที่ UI/API รองรับ ถ้า LINE ID ผูกซ้ำหลายบัญชี ให้ resolve ก่อน migration (SQL จะหยุดถ้าพบ duplicate owner)
4. Apply `001_core.sql`; ถ้าล้ม SQL transaction จะ rollback ตรวจ error ก่อนทำซ้ำ ห้าม apply หลัง commit ซ้ำเนื่องจากชื่อ constraint/policy/function มีอยู่แล้ว
5. Apply `002_import_legacy.sql` ในช่วงที่ไม่มี writer เดิม SQL backfill jobs/expenses/goals ทีละแถว และแยก documents/private state/LINE mapping คง original table สำหรับเทียบข้อมูล ไม่เชื่อ email ใน row เดิม snapshot ใช้ email จาก auth.users
6. รหัส reset/link รุ่นเดิมจะไม่ถูกย้าย ผู้ใช้ต้องขอรหัสใหม่ Original table ถูก revoke จาก browser และจำกัด service role ให้ select เท่านั้น
7. สมาชิก Pro: ใช้ credentials Stripe ของ mode เดียวกับฐานข้อมูล รัน `npm run billing:backfill` ในเครื่องที่รักษา secret ได้ สคริปต์อ่าน Checkout/Charge และสร้าง `database/generated/stripe-backfill.sql` **ไม่เขียน DB** ทบทวน user IDs/payment IDs/วันหมดอายุแล้ว apply โดย migration role ถ้ามีบัญชีพิเศษหรือ trial ที่แก้มือ ให้เทียบกับ subscriptions เดิมก่อน apply
8. เก็บผล preflight/backup แล้ว apply `003_security_hardening.sql` ซึ่งปิด public SECURITY DEFINER RPC จาก browser และบังคับ report bucket เป็น private พร้อม restrictive policy จากนั้น apply `004_roles_groups.sql`, `005_group_finance.sql` และรัน `security-check.sql` ให้ผ่าน RPC เก่าที่ browser เคยเรียกต้องย้ายผ่าน backend ก่อน deploy
9. Deploy frontend/backend ใหม่และตั้ง env ควบคู่กัน เปิด Auth callback allowlist `<APP_URL>/api/auth` ใช้ Node 22+ และ HTTPS
10. ตรวจ row counts ต่อบัญชี, settings, LINE mapping, invoices, Pro status/expiry แล้วเปิด provider webhooks และ cron

ตัวอย่าง reconcile หลัง import:

```sql
select old.user_id,
 jsonb_array_length(coalesce(old.jobs,'[]')) legacy_jobs,
 (select count(*) from public.cashflow_jobs j where j.user_id=old.user_id) migrated_jobs,
 jsonb_array_length(coalesce(old.expenses,'[]')) legacy_expenses,
 (select count(*) from public.cashflow_expenses e where e.user_id=old.user_id) migrated_expenses
from public.user_cashflow_data old;
```

ความต่างต้องตรวจรายการที่ไม่มี ID หรือ ID ซ้ำก่อนเปิดใช้งาน `ON CONFLICT DO NOTHING` ป้องกันข้อมูลใหม่ถูกทับ แต่ไม่ได้ซ่อม JSON ที่ผิดโดยอัตโนมัติ

ใบแจ้งหนี้รุ่นเดิมอยู่ใน browser `remix_invoices` ไม่มี owner ที่เชื่อถือได้ จึงไม่ถูก SQL migrate ในหน้าเอกสารมีปุ่มนำเข้าพร้อมยืนยันว่าเป็นของบัญชีปัจจุบัน ก่อนเปิดเครื่องที่แชร์กันควร export/review เอกสารเก่า

## ตรวจบน staging

- User A และ B อ่านได้เฉพาะข้อมูลตัวเอง; anon อ่านไม่ได้; authenticated JWT เขียน entity หรือเรียก privileged RPC ไม่ได้
- Browser mutations ที่ไม่มี origin/custom header ถูกปฏิเสธ; session ถูก revoke หลัง logout/reset
- สอง connection PostgreSQL แก้ row/version เดียวกันพร้อมกัน ต้องมีหนึ่งสำเร็จและอีกหนึ่ง conflict; OTP attempts ต้องไม่สูญหายและ valid code consume ได้ครั้งเดียว
- เพิ่มจาก LINE พร้อมแก้จากเว็บต้องได้ทั้งสองรายการ; เว็บลบแล้ว LINE เพิ่มไม่ชุบรายการที่ลบ
- Stripe test signature/retry/event IDs คนละตัวของ payment เดียว/refund ordering ให้ entitlement เดิมและไม่ต่ออายุจาก retry
- ประวัติ Stripe backfill ไม่สร้างสิทธิ์จาก link/mode/amount/currency ที่ไม่ตรง
- Gmail/LINE ที่ไม่มี credentials ไม่ส่งจริง; ใส่ test recipients เมื่อเช็ก provider

## Rollback

ก่อนเปิด writer ใหม่ สามารถ rollback deployment/env ไปยัง backup แล้วคืน privileges/schema ตาม database backup ที่ทบทวน หากเริ่มมีข้อมูลในตารางใหม่แล้ว ห้ามเปิดแอปเก่าทันที เพราะแอปเก่าอ่าน snapshot เก่าใน legacy table ให้หยุด writer และ export/reconcile งานใหม่กลับก่อน หรือ restore backup พร้อมแจ้งช่วงข้อมูลที่จะสูญเสีย

ไม่มี destructive down migration เพื่อหลีกเลี่ยงลบข้อมูลบัญชี/ledger โดยไม่ตั้งใจ เก็บ original table จน reconcile และ retention policy ของคุณเสร็จ

## Backup และ scale

backup ผ่าน UI รุ่นใหม่รวม invoices/issuer profile กับ jobs/expenses/goals/settings สำรองระบบจริงด้วย backup ของ Supabase เพิ่มด้วย ไม่พึ่งไฟล์ browser อย่างเดียว

JSONB ช่วยคง field เดิม แต่รูป/base64 และ goal history ยังควรแยก storage/transactions เมื่อโต ข้อจำกัดของ Vercel อาจมาก่อน JSON body limit ของ backend; ลดไฟล์/จำนวนรายการ หรือเพิ่ม private storage และ pagination ก่อนรองรับชุดข้อมูลใหญ่

ก่อน apply ให้รัน `preflight.sql` ทบทวน functions ที่เป็น SECURITY DEFINER และ execute ได้โดย anon/authenticated โดยเฉพาะ RPC รุ่นเก่าที่แก้ subscriptions; migration 003 ปิด browser EXECUTE ของ public SECURITY DEFINER ทั้ง legacy และของใหม่ จากนั้นรัน security-check.sql และทดสอบ catalog ของ project จริงต่างหาก

## อัปเกรดเฉพาะ security hardening (มี 001/002 อยู่แล้ว)

ไม่ต้องรัน 001/002 ซ้ำ สำรอง schema/privileges และ export edits ใน browser ที่ยังไม่ sync, เก็บผล preflight, แล้วรัน 003_security_hardening.sql ตามด้วย 004_roles_groups.sql, 005_group_finance.sql และ security-check.sql บน staging ก่อน production การ hardening ปิด RPC เก่าทั้ง public SECURITY DEFINER จาก anon/authenticated จึงต้องตรวจว่าไม่มี frontend เก่า/แอปอื่นเรียกอยู่ ขั้นตอนนี้ไม่ลบข้อมูลธุรกิจ

ลิงก์รายงานใหม่ต้อง login ด้วยเจ้าของรายงาน ลิงก์ signed URL ที่เคยออกก่อนอัปเกรดยังอาจใช้ได้จนหมดอายุเดิม อย่าทดสอบ migration โดยถือว่าลิงก์เก่าถูก revoke แล้ว รวมตรวจ HTTP public object URL ให้ถูกปฏิเสธหลัง bucket เป็น private

หาก Node server อยู่หลัง reverse proxy จะใช้ socket IP ของ proxy เพื่อไม่เชื่อ headers ที่ client ปลอมได้ ตั้ง IP/traffic limits ที่ proxy/edge ด้วย บน Vercel ใช้ header ที่ platform overwrites โดยไม่รับ x-forwarded-for ของ client เอง

## อัปเกรด role และกลุ่ม (มี 001–003 แล้ว)

1. สำรองฐานข้อมูล แล้ว apply `migrations/004_roles_groups.sql` ด้วย postgres/migration role บน staging การ backfill และ signup trigger ให้ทุกบัญชีเริ่มเป็น user ไม่เชื่อ role ใน user metadata
2. รัน `migrations/005_group_finance.sql` เพื่อเพิ่มพื้นที่การเงินกลุ่ม
3. รัน `migrations/006_public_profiles.sql` เพื่อสร้างชื่อแสดงผล, User ID ถาวร และคำเชิญแบบผูกบัญชี
4. สมัครบัญชี admin ที่ต้องการและยืนยันอีเมล ตรวจ `auth.users.id` กับอีเมลให้ตรงกัน เปิด `bootstrap-admin.sql` เปลี่ยน nil UUID เป็น ID นี้และทบทวนก่อนรัน สคริปต์ใช้ได้เฉพาะกรณียังไม่มี admin และบันทึก audit สำหรับการเริ่มต้น
5. Refresh/login ด้วยบัญชีนี้แล้วเปิด **กลุ่ม & สมาชิก → จัดการผู้ใช้** การเปลี่ยน role ครั้งถัดไปใช้หน้า admin ซึ่งป้องกันการลดสิทธิ์ admin คนสุดท้าย
6. รัน `security-check.sql` ตรวจ RLS/privileges/กลุ่มต้องมีหัวหน้า แล้วทดสอบ user A/B/คนนอก/admin กับบัญชีจริงก่อน deploy

| การทำงาน | user / คนนอกกลุ่ม | ลูกน้อง | หัวหน้า | admin |
|---|---|---|---|---|
| สร้างกลุ่มของตัวเอง | ได้ | ได้ | ได้ | ได้ |
| ดูสมาชิกในกลุ่ม | ไม่ได้ | ได้ | ได้ | ทุกกลุ่ม |
| รับ/ปฏิเสธคำเชิญที่ตรงกับอีเมลตัวเอง | ได้ | ได้ | ได้ | ได้ |
| เชิญ/ยกเลิกคำเชิญ/นำสมาชิกออก | ไม่ได้ | ไม่ได้ | ได้ | ทุกกลุ่ม |
| เพิ่ม/ลดสิทธิ์ในกลุ่ม | ไม่ได้ | ไม่ได้ | ได้ | ทุกกลุ่ม |
| โอนตำแหน่งของตัวเอง | ไม่ได้ | ไม่ได้ | ได้ | ต้องเป็นหัวหน้าในกลุ่มนั้น |
| ออกจากกลุ่ม | ต้องเป็นสมาชิก | ได้ | ต้องเหลือหัวหน้าคนอื่น | ต้องเป็นสมาชิก และใช้กฎหัวหน้าเดียวกัน |
| แก้ไข/ลบกลุ่ม | ไม่ได้ | ไม่ได้ | ได้ | ทุกกลุ่ม |
| เปลี่ยน role ระบบ admin/user | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| อ่านข้อมูลการเงินส่วนตัวของคนอื่น | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |

ผู้สร้างกลุ่มไม่มีสิทธิ์พิเศษคงค้างหลังโอนตำแหน่ง `created_by` เป็นประวัติเท่านั้น Mutation ตรวจสิทธิ์หลังล็อก group row การโอนทำสอง role ใน transaction เดียว Constraint trigger ตรวจว่าทุกกลุ่มยังมีหัวหน้าตอน commit ตารางและ RPC ของฟีเจอร์นี้เป็น backend-only แม้ผู้ใช้จะมี authenticated JWT ก็อ่าน/เขียนตรงไม่ได้

คำเชิญผูกกับอีเมลปัจจุบันที่ยืนยันแล้ว หมดอายุ 7 วัน การเชิญซ้ำสร้าง invitation ID ใหม่ คำเชิญที่รับแล้วไม่สามารถใช้กลับเข้ากลุ่มหลังถูกนำออกหรือออกเองได้ ต้องรับคำเชิญใหม่ หัวหน้า/admin เท่านั้นที่เห็นคำเชิญรอและกิจกรรมล่าสุด 20 รายการ สมาชิกเห็นอีเมลสมาชิกในกลุ่ม แต่ไม่เห็น auth tokens หรืออีเมลของคนนอกกลุ่ม

จำกัดสร้าง 50 กลุ่มต่อบัญชี, เข้าร่วม 200 กลุ่มต่อบัญชี, สมาชิก 100 คนต่อกลุ่ม และคำเชิญรอที่ยังไม่หมดอายุ 100 รายการต่อกลุ่ม รายการกลุ่มแบ่งหน้า 20 กลุ่ม ผู้ใช้ในหน้า admin แบ่งหน้า 25 บัญชี Audit เก็บ role changes กับกิจกรรมกลุ่ม เมื่อกลุ่มถูกลบ audit ของกลุ่มนั้นถูกลบตามด้วย ข้อมูลการเงินไม่เปลี่ยน ownership

ก่อนลบบัญชีผ่าน Supabase ต้องโอนหัวหน้า/เพิ่มหัวหน้าคนอื่นหรือลบกลุ่มที่บัญชีนั้นเป็นหัวหน้าคนเดียวก่อน มิฉะนั้น constraint ปฏิเสธการลบ ให้มี admin คนอื่นก่อนลบบัญชี admin ด้วยเครื่องมือภายนอก

PGlite tests ตรวจ SQL transaction/constraint/สิทธิ์ แต่ใช้ connection เดียว บน staging ต้องทดสอบพร้อมกันจาก PostgreSQL สอง connection เช่น หัวหน้า A/B ลดสิทธิ์กันหรือออกพร้อมกัน ต้องไม่สามารถ commit จนกลุ่มไม่มีหัวหน้า และให้ admin A/B ลดสิทธิ์พร้อมกัน ต้องไม่เหลือระบบไร้ admin ผ่าน RPC

## การเงินกลุ่ม (migration 005)

ใช้ `migrations/005_group_finance.sql` หลัง 004 ไม่ต้องรัน migration เก่าซ้ำ แล้วรัน `security-check.sql` ใหม่ ตาราง `cashflow_group_finance` ใช้ primary key `(group_id, entity_table, id)` ข้อมูลส่วนตัวอยู่ตารางเดิม RPC snapshot/apply ตรวจสมาชิกจาก actor ที่ server ยืนยันทุกคำขอ ไม่ให้ admin ที่อยู่นอกกลุ่มอ่านข้อมูลการเงิน Lock group row ประสานกับการเตะ/ออก/โอนหัวหน้า สมาชิกทุกคนแก้ข้อมูลได้ ใช้ version และ transaction ทั้ง batch ป้องกันเขียนทับ การโอนหัวหน้าไม่ย้าย ownership การลบกลุ่มลบข้อมูลการเงินกลุ่มตามไปด้วย จึงควรสำรองก่อนลบ

ตารางและ RPC เป็น service-only; authenticated/anon อ่านเขียนหรือเรียกตรงไม่ได้ บันทึกผู้แก้ไขล่าสุดใน `updated_by` และเวลาใน `updated_at` จำกัด 20,000 records และข้อมูล 4 MiB ต่อกลุ่ม API ตรวจ validation เดียวกับส่วนตัวและจำกัดขนาด response/request กลุ่มไม่เก็บ avatar หรือ LINE private state/ID ไม่ย้าย subscriptions หรือ privileges ของเจ้าของไปกลุ่ม
