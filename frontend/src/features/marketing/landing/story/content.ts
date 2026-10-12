import type { ShotName } from './shots.gen';

// Everything the landing story says and shows, in one place: the copy, which real screenshot
// stands behind each beat, and when each beat happens along the scroll.
//
// English headings never take a full stop; a line break does that job. Thai copy says what the
// app does for the reader. Plan facts follow the app's plan cards and the previous landing (see FREE.plans).

export const CTA = 'เริ่มใช้งานฟรี';

export const HERO = {
  en: ['Every project', 'Every payment'],
  th: ['รับงานหลายโปรเจกต์', 'ไม่ต้องจำเองว่าเงินจะเข้าวันไหน'],
  support: 'ติดตามยอดรับแล้ว ยอดค้างรับ และกำหนดรับเงินของแต่ละงาน ทั้งเงินมัดจำ การแบ่งจ่ายเป็นงวด และเครดิตเทอม',
  hint: 'เลื่อนลงเพื่อดูการทำงาน',
  reveal: 'ไทม์ไลน์ในแอป รวมกำหนดรับเงินของทุกงานไว้หน้าเดียว',
} as const;

export const DUE = {
  en: ['Know what’s due'],
  th: ['รับแล้วเท่าไร เหลืออีกเท่าไร', 'และงวดต่อไปมีกำหนดรับวันไหน'],
  steps: [
    'งานที่แบ่งจ่าย เห็นทีละงวด พร้อมวันครบกำหนดของแต่ละงวด',
    'กดดูงานตัดต่อวิดีโอ 6,000 บาท รับแล้ว 2,000 บาท ค้างรับ 4,000 บาท',
    'ลูกค้าโอนงวดที่ 2 มา 1,000 บาท เลือกงวดนั้นแล้วกดยืนยัน',
    'แอปปรับยอดให้เอง เป็นรับแล้ว 3,000 บาท ค้างรับ 3,000 บาท',
    'งานเครดิตเทอม 30 หรือ 45 วัน แอปนับวันครบกำหนดจากวันส่งงานให้',
  ],
  note: 'กำหนดรับเงินมาจากข้อมูลที่คุณบันทึกเอง แอปไม่ได้เชื่อมกับบัญชีธนาคาร',
} as const;

/**
 * The six tiles of the LINE menu as it shows today. Names and descriptions are the words printed on
 * the menu itself. `box` is where the tile sits in the picture and `cover` is the share of the
 * picture dimmed until its turn, both as [left, top, right, bottom] fractions.
 */
export const LINE_TILES = [
  { name: 'เพิ่มรายการ', does: 'บันทึกรายรับ · รายจ่าย', box: [0.006, 0.011, 0.574, 0.655], cover: [0, 0, 0.58, 0.665] },
  { name: 'รอรับเงิน', does: 'ดูยอดที่ยังรอรับ', box: [0.587, 0.011, 0.994, 0.323], cover: [0.58, 0, 1, 0.333] },
  { name: 'สรุปเดือนนี้', does: 'ภาพรวมรายรับ · รายจ่าย', box: [0.587, 0.343, 0.994, 0.655], cover: [0.58, 0.333, 1, 0.665] },
  { name: 'งานเดือนนี้', does: 'ดูรายการงาน', box: [0.006, 0.676, 0.327, 0.99], cover: [0, 0.665, 0.3335, 1] },
  { name: 'กำลังดำเนินงาน', does: 'ติดตามงานที่ทำ', box: [0.34, 0.676, 0.66, 0.99], cover: [0.3335, 0.665, 0.6665, 1] },
  { name: 'เปิดแอป', does: 'ไปที่กระรอกตุนเงิน', box: [0.673, 0.676, 0.994, 0.99], cover: [0.6665, 0.665, 1, 1] },
] as const;
/** The order the tiles light up: what you check first, then the big tile, which the phone then opens. */
export const LINE_ORDER = [1, 2, 3, 4, 5, 0] as const;

export const LINE = {
  en: ['Stay updated', 'on LINE'],
  th: ['ไม่อยู่หน้าคอม', 'ก็เช็กงานกับเงินได้'],
  support: 'ดูยอดที่ยังรอรับ เช็กสรุปเดือนนี้ และรับสรุปยอดค้างรายวันผ่าน LINE จากข้อมูลที่คุณบันทึกไว้ในแอป',
  plan: 'ใช้ได้ในแพ็กเกจ Pro',
  form: 'กด “เพิ่มรายการ” เพื่อบันทึกรายรับหรือรายจ่ายได้จากแชต',
  notes: ['สรุปส่งถึงคุณ ไม่ได้ส่งไปทวงลูกค้า', 'ยอดที่เห็นคือข้อมูลในแอป ไม่ใช่ยอดในบัญชีธนาคาร'],
} as const;

export type View = { x: number; y: number; w: number; h: number };
export type DocSlide = {
  key: string; part: string; title: string; body: string; note?: string;
  wide: { shot: ShotName; view: View }; narrow: { shot: ShotName; view: View };
  /** Something on the real screen worth pointing at, in the screenshot's own coordinates. */
  mark?: { wide?: View; narrow?: View; label: string };
};

export const DOCS = {
  en: ['Create and', 'keep it together'],
  th: ['ออกเอกสารจากงาน', 'เก็บเอกสารให้เป็นที่'],
  plan: 'ออกเอกสารและอัปโหลดเข้าคลังได้ในแพ็กเกจ Pro',
  slides: [
    {
      key: 'quotation', part: 'ออกเอกสาร', title: 'ทำใบเสนอราคาในแอป',
      body: 'ใส่รายการกับราคา แล้วดูหน้าตาเอกสารก่อนส่งให้ลูกค้า',
      wide: { shot: 'quotation', view: { x: 628, y: 184, w: 800, h: 600 } },
      narrow: { shot: 'narrow-quotation', view: { x: 0, y: 292, w: 430, h: 520 } },
    },
    {
      key: 'pdf', part: 'ออกเอกสาร', title: 'ได้ไฟล์ PDF จากระบบ',
      body: 'กดดาวน์โหลด PDF แล้วส่งต่อให้ลูกค้าเองได้เลย',
      note: 'ภาพนี้คือหน้าแรกของไฟล์ QT-2569-001.pdf ที่แอปสร้าง',
      wide: { shot: 'quotation-pdf', view: { x: 0, y: 0, w: 620.5, h: 460 } },
      narrow: { shot: 'quotation-pdf', view: { x: 150, y: 60, w: 470, h: 568 } },
    },
    {
      key: 'vault', part: 'เก็บเอกสาร', title: 'เก็บไฟล์ที่ได้รับไว้ในคลัง',
      body: 'อัปโหลดใบ 50 ทวิ สัญญา และสลิปรายจ่ายเข้าคลังด้วยตัวเอง แล้วกรองดูตามปีที่อัปโหลด',
      wide: { shot: 'vault-year', view: { x: 262, y: 108, w: 1160, h: 870 } },
      narrow: { shot: 'narrow-vault', view: { x: 0, y: 186, w: 430, h: 520 } },
      mark: { wide: { x: 1248, y: 271, w: 160, h: 56 }, narrow: { x: 16, y: 452, w: 398, h: 44 }, label: 'ตัวกรองปี' },
    },
    {
      key: 'wht50', part: 'เก็บเอกสาร', title: 'รู้ว่างานไหนยังไม่ได้ใบ 50 ทวิ',
      body: 'ใบ 50 ทวิเป็นเอกสารที่ผู้ว่าจ้างออกให้คุณ แอปช่วยเก็บใบที่ได้รับ และบอกว่างานไหนยังต้องตาม',
      wide: { shot: 'wht50', view: { x: 262, y: 20, w: 1160, h: 870 } },
      narrow: { shot: 'narrow-wht50', view: { x: 0, y: 214, w: 430, h: 520 } },
    },
  ] satisfies DocSlide[],
} as const;

export type BentoCard = { key: string; title: string; span: 'wide' | 'tall' | 'small' | 'mid' | 'full'; wide: { shot: ShotName; view: View }; narrow?: { shot: ShotName; view: View } };

export const FREE = {
  en: ['Start free'],
  th: ['เริ่มติดตามงาน', 'และกำหนดรับเงินได้ฟรี'],
  support: 'ทุกภาพในส่วนนี้ถ่ายจากบัญชี Free',
  cards: [
    { key: 'jobs', title: 'บันทึกงานและรายรับรายจ่ายได้ไม่จำกัด', span: 'wide', wide: { shot: 'jobs', view: { x: 262, y: 118, w: 1160, h: 500 } }, narrow: { shot: 'narrow-jobs', view: { x: 0, y: 438, w: 430, h: 400 } } },
    { key: 'follow', title: 'เห็นว่างานไหนต้องตามเงินก่อน', span: 'tall', wide: { shot: 'follow-up', view: { x: 0, y: 0, w: 320, h: 414 } } },
    { key: 'month', title: 'รู้ว่าเดือนนี้เงินจะเข้าเท่าไร', span: 'small', wide: { shot: 'month-money', view: { x: 0, y: 0, w: 280, h: 238 } } },
    { key: 'calendar', title: 'ปฏิทินวันส่งงานและวันครบกำหนดรับเงิน', span: 'mid', wide: { shot: 'calendar', view: { x: 272, y: 196, w: 600, h: 330 } }, narrow: { shot: 'calendar', view: { x: 272, y: 190, w: 560, h: 380 } } },
    { key: 'dashboard', title: 'ภาพรวมรายรับ รายจ่าย และกำไรของเดือน', span: 'full', wide: { shot: 'dashboard', view: { x: 262, y: 100, w: 1160, h: 370 } }, narrow: { shot: 'dashboard', view: { x: 268, y: 244, w: 580, h: 210 } } },
  ] satisfies BentoCard[],
  // Lists follow the app's own plan cards (i18n plans.free1-5, plans.pro1-5). Price and terms are the
  // statements the previous landing made on this billing branch, kept word for word.
  // Not offered here on purpose: "Free can issue 10 documents a month". PlansTab still shows it as
  // "coming soon" (freeDocumentsAvailable is false), so documents are Pro only today. The app's 14-day
  // trial for new accounts is not advertised either, as on the previous landing.
  plans: {
    free: { name: 'Free', price: '฿0', items: ['บันทึกงาน รายรับ รายจ่าย และติดตามเครดิตเทอม', 'ดูแดชบอร์ดกระแสเงินสดและภาพรวมรายเดือน', 'จัดสรรเงินและตั้งเป้าหมายออม', 'ใช้ปฏิทินงาน รายการลูกหนี้ และรายงานภาพรวม', 'สำรองและกู้คืนข้อมูลออฟไลน์'] },
    pro: {
      name: 'Pro', badge: 'โปรเปิดตัว · ลด ฿50/รอบ', price: '฿199', per: '/ เดือน', priceNote: ['3 รอบบิลรายเดือนแรก', 'รอบบิลที่ 4 เป็นต้นไป ฿249 / เดือน'],
      items: ['ทุกอย่างใน Free', 'ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ พร้อมดาวน์โหลด PDF ได้ไม่จำกัด', 'เชื่อม LINE รับสรุปยอดค้างรายวัน และสรุปรายรับ-รายจ่ายรายเดือน', 'ผู้ช่วยภาษีบุคคลธรรมดา พร้อมจัดการข้อมูลหัก ณ ที่จ่าย', 'วิเคราะห์รายได้เชิงลึก เลือกช่วงเวลา ลูกค้า และประเภทงานได้'],
      terms: ['โปรโมชัน ฿199 ใช้ได้หนึ่งครั้งต่อบัญชีที่มีสิทธิ์', 'ต่ออายุอัตโนมัติทุกเดือนจนกว่าจะยกเลิก', 'แพ็กเกจที่ชำระเงินเริ่มคิดเงินทันทีเมื่อ Checkout สำเร็จ ไม่มีช่วงทดลองใช้ฟรีเพิ่ม', 'ยกเลิกผ่านหน้าจัดการสมาชิก และใช้ Pro ต่อได้จนจบรอบที่ชำระแล้ว'],
    },
  },
} as const;

export const CLOSING = {
  en: ['More time', 'for your work'],
  th: ['ใช้เวลากับงาน', 'ไม่ใช่ไล่จำวันรับเงิน'],
} as const;

/**
 * When each beat of the first act happens, as a share of the act's scroll distance. One place to
 * retime the whole story: the layout code only reads these names.
 */
export const BEAT = {
  seated: 0.10,     // the loose job rows are in their places and the full screen is showing
  held: 0.15,       // ...and has been left alone long enough to read
  zoomed: 0.23,     // looking closely at the two instalments of one job
  card: 0.31,       // that job's card is open
  sheet: 0.385,     // the instalment sheet is open next to it
  saved: 0.455,     // the card shows what the app worked out
  credit: 0.535,    // two credit-term jobs with their due dates
  creditHeld: 0.60,
  line: 0.685,      // dark scene, the LINE menu is the picture
  tiles: 0.81,      // all six tiles are lit
  form: 0.895,      // the form the menu opens, on a phone
} as const;

/** How many screens of scrolling each pinned act takes. */
export const SCREENS = { money: 10, docs: 5 } as const;
