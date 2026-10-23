
/** Every unprefixed message stays on the deterministic path, including unsupported inputs. */
export function explicitLineAiText(text: string): string | null {
  const match = /^(?:ถาม\s*AI|AI)[\s:：]+(.+)$/is.exec(text.trim());
  return match?.[1].trim() || null;
}

// The app records jobs and the income they bring (owner, 2026-10-22: "ของเรามันเอาไว้จดงาน จดรายรับที่
// เป็นงาน"), so the examples (welcome card, greeting text) are jobs. Every example is one
// parseLineQuickDraft turns into a job draft (tests/line-entry-help.test.ts); none may contain
// "ตัวอย่าง", which the parser refuses on purpose.
export const LINE_JOB_EXAMPLES = [
  'เพิ่มงาน ออกแบบโลโก้ 5000',
  'เพิ่มงาน ถ่ายภาพ ให้ร้านดอกไม้ 12000',
  'เพิ่มงาน ตัดต่อวิดีโอ 8000 รอรับเงิน',
] as const;
