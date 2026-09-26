import { appOrigin } from '../config/env.js';
import { sendGmailEmail } from './gmail.js';

// Thailand has used UTC+7 year-round. Calendar-day comparison keeps the three
// reminders on the three local dates before the deletion date, regardless of
// what time of day the account was paused.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
export function bangkokDayNumber(date: Date): number {
  return Math.floor((date.getTime() + BANGKOK_OFFSET_MS) / 86_400_000);
}
export function bangkokDayKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export async function sendAccountPauseReminder(email: string, deleteAfter: Date, daysLeft: number): Promise<boolean> {
  const deadline = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(deleteAfter);
  const url = `${appOrigin()}/app#login`;
  return sendGmailEmail(email, `อีก ${daysLeft} วัน บัญชีจะถูกลบถาวร | Krarok Tunngern`, `
    <!doctype html>
    <html lang="th"><body style="margin:0;padding:30px 12px;background:#f8f1e7;font-family:Arial,'Noto Sans Thai',sans-serif;color:#382519">
      <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e8d8c7;border-radius:18px;overflow:hidden">
        <div style="padding:20px 28px;background:#3a2418;color:#fff;font-size:18px;font-weight:700">🐿️ กระรอกตุนเงิน</div>
        <div style="padding:30px 28px">
          <p style="margin:0;color:#b45b2b;font-weight:700">แจ้งเตือนการพักบัญชี</p>
          <h1 style="font-size:23px;line-height:1.4;margin:10px 0">เหลือ ${daysLeft} วันก่อนลบบัญชีถาวร</h1>
          <p style="font-size:15px;line-height:1.8">โปรดกลับไปดำเนินการเปิดบัญชีอีกครั้ง<strong>ภายในวันที่ ${deadline} น.</strong> หากพ้นกำหนดนี้ บัญชีและข้อมูลส่วนตัวของคุณจะเข้าสู่กระบวนการลบถาวรและไม่สามารถกู้คืนได้</p>
          <p style="font-size:14px;line-height:1.7">เข้าสู่ระบบด้วยบัญชีเดิม แล้วกดปุ่ม “เปิดใช้บัญชีอีกครั้ง” เพื่อยกเลิกการลบ</p>
          <a href="${url}" style="display:inline-block;margin-top:12px;padding:13px 22px;border-radius:11px;background:#e65f2b;color:#fff;text-decoration:none;font-weight:700">กลับไปเปิดใช้บัญชี</a>
          <p style="margin-top:22px;color:#806b5e;font-size:12px;line-height:1.6">หากคุณเปิดใช้บัญชีแล้ว สามารถละเว้นอีเมลฉบับนี้ได้</p>
        </div>
      </div>
    </body></html>`);
}
