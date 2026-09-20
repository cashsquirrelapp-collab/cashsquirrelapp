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
