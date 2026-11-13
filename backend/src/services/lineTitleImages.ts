// Made by scripts/render-line-titles.mjs: the CI-typeface title pictures in /line/titles-v1/ and their sizes (CSS pixels at 44px).
export const LINE_TITLE_FOLDER = '/line/titles-v1';
export const LINE_TITLE_IMAGES = {
  'quotation': { words: 'ใบเสนอราคา', width: 233, height: 65 },
  'invoice': { words: 'ใบแจ้งหนี้', width: 184, height: 65 },
  'tax-invoice': { words: 'ใบกำกับภาษี', width: 228, height: 65 },
  'receipt': { words: 'ใบเสร็จรับเงิน', width: 261, height: 65 },
  'receipt-tax-invoice': { words: 'ใบเสร็จรับเงิน ใบกำกับภาษี', width: 261, height: 122 },
  'document': { words: 'เอกสาร', width: 144, height: 65 },
  'assistant': { words: 'เลขากระรอก', width: 238, height: 65 },
  'line': { words: 'เชื่อมต่อ LINE', width: 264, height: 65 },
  'review': { words: 'บันทึกรายการ', width: 258, height: 65 },
  'work': { words: 'งาน', width: 79, height: 65 },
  'update': { words: 'อัปเดตรายการ', width: 276, height: 65 },
  'report': { words: 'รายงาน', width: 149, height: 65 },
  'reminder': { words: 'แจ้งเตือน', width: 185, height: 65 },
  'expense': { words: 'รายจ่าย', width: 147, height: 65 },
  'income': { words: 'รายรับ', width: 126, height: 65 },
  'saving': { words: 'เงินออม', width: 157, height: 65 },
  'withdraw': { words: 'ถอนเงินออม', width: 242, height: 65 },
} as const;
export type LineTitleKey = keyof typeof LINE_TITLE_IMAGES;
