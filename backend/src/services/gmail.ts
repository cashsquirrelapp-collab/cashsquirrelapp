import nodemailer from 'nodemailer';

// Sends automated emails through a real Gmail account instead of a third-party transactional
// service, since Resend's free sandbox domain (onboarding@resend.dev) can only deliver to the
// Resend account owner's own email -- it silently can't reach any other app user. Gmail has no
// such restriction once authenticated with an App Password.

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
  }
  return transporter;
}

export async function sendGmailEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; content: string }[] // content is base64
): Promise<boolean> {
  try {
    await getTransporter().sendMail({
      from: `กระรอกตุนเงิน <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: 'base64',
      })),
    });
    return true;
  } catch (err) {
    console.error(`sendGmailEmail: failed to send to ${to}:`, err);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]!);
}

export async function sendSignupConfirmationEmail(to: string, displayName: string | undefined, confirmationUrl: string): Promise<boolean> {
  const safeName = escapeHtml(displayName?.trim() || 'ผู้ใช้ใหม่');
  const safeUrl = escapeHtml(confirmationUrl);
  return sendGmailEmail(to, 'ยืนยันการสมัครสมาชิก | Krarok Tunngern', `
    <!doctype html>
    <html lang="th">
      <body style="margin:0;padding:0;background:#f5f3ef;font-family:Arial,'Noto Sans Thai',sans-serif;color:#29231f">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">ยืนยันอีเมลเพื่อเริ่มใช้งานบัญชี Krarok Tunngern ของคุณ</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef;padding:32px 12px">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e1d8;border-radius:18px;overflow:hidden">
              <tr><td style="padding:22px 30px;background:#2d2118;color:#ffffff;font-size:17px;font-weight:700">Krarok Tunngern</td></tr>
              <tr><td style="padding:36px 30px 18px">
                <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;color:#a65328;text-transform:uppercase">Welcome</div>
                <h1 style="margin:10px 0 12px;font-size:25px;line-height:1.35;color:#29231f">ยินดีต้อนรับ ${safeName}</h1>
                <p style="margin:0;font-size:15px;line-height:1.75;color:#655b53">บัญชีของคุณถูกสร้างแล้ว เหลือเพียงยืนยันว่าอีเมลนี้เป็นของคุณก่อนเริ่มใช้งาน</p>
              </td></tr>
              <tr><td style="padding:10px 30px 30px;text-align:center">
                <a href="${safeUrl}" style="display:inline-block;border-radius:12px;background:#d85b2a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 24px">ยืนยันอีเมลและเปิดใช้งานบัญชี</a>
                <p style="margin:16px 0 0;font-size:12px;line-height:1.65;color:#806f61">ลิงก์นี้มีอายุ 24 ชั่วโมงและใช้สำหรับบัญชีนี้เท่านั้น</p>
              </td></tr>
              <tr><td style="padding:4px 30px 34px">
                <div style="border-left:3px solid #d97745;padding:2px 0 2px 14px">
                  <div style="font-size:13px;font-weight:700;color:#403731">หากคุณไม่ได้สมัครบัญชีนี้</div>
                  <div style="margin-top:5px;font-size:13px;line-height:1.65;color:#74685f">ไม่ต้องกดลิงก์และสามารถละเว้นอีเมลนี้ได้ เราจะไม่เปิดใช้งานบัญชีจนกว่าจะยืนยันอีเมล</div>
                </div>
              </td></tr>
              <tr><td style="padding:20px 30px;background:#faf8f5;border-top:1px solid #eee8e1;text-align:center;color:#8b8078;font-size:11px;line-height:1.6">อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br>© Krarok Tunngern · ระบบจัดการกระแสเงินสดสำหรับบุคคลและองค์กร</td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`);
}
