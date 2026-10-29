import { z } from 'zod';
import { FEEDBACK_MAX_BODY_LENGTH, type FeedbackCategory } from './feedback.js';

// Reports from the public landing page (owner, 2026-10-29): people who have not signed in can report a problem, suggest an
// idea or send general feedback. They go into the same แจ้งปัญหา system as the app's own (one conversation in the admin
// inbox, the same LINE alert), so this file only turns the form into that system's plain-text message.

export const PUBLIC_FEEDBACK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PUBLIC_FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const publicFeedbackKindSchema = z.enum(['bug', 'idea', 'general']);
export type PublicFeedbackKind = z.infer<typeof publicFeedbackKindSchema>;
// Together with the labels and an email these stay under the system's 4,000-character message.
export const PUBLIC_FEEDBACK_LIMITS = { subject: 120, details: 1600, page: 150, steps: 700, happened: 700 } as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => !value.includes('\0'));
const optionalText = (max: number) => z.string().trim().max(max).refine(value => !value.includes('\0')).optional();

export const publicFeedbackSchema = z.object({
  kind: publicFeedbackKindSchema,
  subject: text(3, PUBLIC_FEEDBACK_LIMITS.subject),
  details: text(5, PUBLIC_FEEDBACK_LIMITS.details),
  /** A bug: the page it was on, what was done just before, and what happened. */
  page: optionalText(PUBLIC_FEEDBACK_LIMITS.page),
  steps: optionalText(PUBLIC_FEEDBACK_LIMITS.steps),
  happened: optionalText(PUBLIC_FEEDBACK_LIMITS.happened),
  /** Optional, only to answer this report. */
  email: z.union([z.literal(''), z.email().max(254)]).optional(),
  image: z.object({
    name: z.string().trim().max(120),
    type: z.enum(PUBLIC_FEEDBACK_IMAGE_TYPES),
    data: z.string().max(Math.ceil(PUBLIC_FEEDBACK_IMAGE_MAX_BYTES / 3) * 4 + 8).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }).strict().optional(),
  /** A field people never see or fill; only bots do. */
  website: z.string().max(200).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind !== 'bug') return;
  for (const key of ['page', 'steps', 'happened'] as const) {
    if (!value[key] || value[key].length < 2) ctx.addIssue({ code: 'custom', path: [key], message: 'required for a bug report' });
  }
});
export type PublicFeedbackInput = z.infer<typeof publicFeedbackSchema>;

/** The categories of the existing system (the inbox's ทั่วไป is its "other"). */
export const PUBLIC_FEEDBACK_CATEGORY: Record<PublicFeedbackKind, FeedbackCategory> = { bug: 'bug', idea: 'idea', general: 'other' };
export const PUBLIC_FEEDBACK_KIND_LABEL: Record<PublicFeedbackKind, string> = {
  bug: 'แจ้งปัญหา / บั๊ก', idea: 'เสนอไอเดีย / ขอฟีเจอร์', general: 'ความคิดเห็นทั่วไป',
};

/** The message the team reads in the admin inbox: plain text, every field labelled, the sender's contact last. */
export function publicFeedbackBody(input: PublicFeedbackInput, imageAttached: boolean): string {
  const lines = [
    '[จากหน้าเว็บ · ผู้ส่งยังไม่ได้เข้าสู่ระบบ]',
    `ประเภท: ${PUBLIC_FEEDBACK_KIND_LABEL[input.kind]}`,
    `หัวข้อ: ${input.subject}`,
    `อีเมลติดต่อกลับ: ${input.email ? input.email : 'ไม่ได้ให้ไว้'}`,
    `ภาพประกอบ: ${imageAttached ? '1 ไฟล์ ส่งไปที่อีเมลของทีม' : 'ไม่มี'}`,
    '',
    'รายละเอียด:',
    input.details,
  ];
  if (input.kind === 'bug') {
    lines.push('', `หน้าที่พบปัญหา: ${input.page ?? ''}`, '', 'สิ่งที่ทำก่อนพบปัญหา:', input.steps ?? '', '', 'สิ่งที่เกิดขึ้น:', input.happened ?? '');
  }
  return lines.join('\n').slice(0, FEEDBACK_MAX_BODY_LENGTH);
}

/** The file really is the picture type it says (its first bytes), so nothing else is passed on as an image. */
export function imageMatchesType(bytes: Uint8Array, type: (typeof PUBLIC_FEEDBACK_IMAGE_TYPES)[number]): boolean {
  const starts = (...values: number[]) => values.every((value, at) => bytes[at] === value);
  if (type === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
