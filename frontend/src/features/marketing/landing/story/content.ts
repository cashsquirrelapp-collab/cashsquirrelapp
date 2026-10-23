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
  th: ['งานเสร็จ ไม่ได้แปลว่าได้เงินครบ', 'ดูได้ว่างานไหนยังต้องตาม'],
  // One short line per beat: what you get, not which button to press.
  steps: [
    'งานเดียวรับเงินหลายงวด เห็นเลยว่างวดไหนครบเมื่อไร',
    'งานตัดต่อวิดีโอ 6,000 บาท ได้มัดจำแล้ว 2,000 ยังรออีก 4,000',
    'เงินงวดถัดไปเข้า บันทึกครั้งเดียว',
    'ยอดที่เหลือปรับให้เอง เหลือรออีก 3,000',
    'เครดิต 30 หรือ 45 วัน รู้เลยว่าครบวันไหน',
  ],
  note: 'กำหนดรับเงินคิดจากเงื่อนไขที่คุณบันทึกไว้ ไม่ได้รับประกันว่าลูกค้าจะโอนตรงวัน และไม่ได้เชื่อมกับบัญชีธนาคาร',
} as const;

/** Where the “รอรับเงิน” tile sits in the real menu picture, as [left, top, right, bottom] fractions. */
export const LINE_TAP = [0.587, 0.011, 0.994, 0.323] as const;

export const LINE = {
  en: ['Stay updated', 'on LINE'],
  th: ['ไม่อยู่หน้าคอม', 'ก็เช็กงานกับเงินได้'],
  plan: 'ใช้ได้ในแพ็กเกจ Pro',
  // The two events the scene plays, each with the one thing it is good for.
  check: 'แตะ “รอรับเงิน” เห็นทุกงานที่ยังรอ พร้อมยอดและกำหนดรับ',
  notice: 'มีงานถึงกำหนดรับเงิน ก็ไม่ต้องคอยจำวันเอง',
  notes: ['แจ้งเตือนส่งถึงคุณ ไม่ได้ส่งไปทวงลูกค้า', 'ยอดที่เห็นคือข้อมูลล่าสุดในแอป ไม่ใช่ยอดในบัญชีธนาคาร'],
  title: 'กระรอกตุนเงิน',
} as const;

export type View = { x: number; y: number; w: number; h: number };

/** Three documents of one job (งานตัดต่อวิดีโอ, 6,000 baht in three instalments), each a page the app produced. */
export const DOCS = {
  en: ['Ready for', 'your next client'],
  th: ['ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ', 'พร้อมส่งให้ลูกค้า'],
  plan: 'ออกเอกสารได้ในแพ็กเกจ Pro',
  sheets: [
    { shot: 'doc-quotation', name: 'ใบเสนอราคา', says: 'ทั้งงาน 6,000 บาท' },
    { shot: 'doc-invoice', name: 'ใบแจ้งหนี้', says: 'เรียกเก็บงวดที่ 2 1,000 บาท' },
    { shot: 'doc-receipt', name: 'ใบเสร็จ', says: 'รับเงินงวดที่ 2 1,000 บาท' },
  ],
  note: 'ทั้งสามใบเป็นของงานตัดต่อวิดีโองานเดียวกัน',
} as const satisfies { sheets: readonly { shot: ShotName; name: string; says: string }[] } & Record<string, unknown>;

export const VAULT = {
  en: ['Ready when', 'you need it'],
  th: ['สิ้นปี ไม่ต้องย้อนหาบิล', 'ทีละแชต'],
  plan: 'อัปโหลดเข้าคลังได้ในแพ็กเกจ Pro',
  support: 'ได้ใบ 50 ทวิ สัญญา หรือสลิปมาเมื่อไร อัปโหลดเก็บไว้กับงานนั้น',
  files: [
    { wide: 'vault-file-wht', narrow: 'nvault-file-wht' },
    { wide: 'vault-file-po', narrow: 'nvault-file-po' },
    { wide: 'vault-file-slip', narrow: 'nvault-file-slip' },
  ],
  // The filter on this page is the year a file was uploaded, so the copy says exactly that.
  pick: 'เลือกปีที่อัปโหลด แล้วดาวน์โหลดไฟล์ที่แสดงเป็นชุดเดียว',
} as const satisfies { files: readonly { wide: ShotName; narrow: ShotName }[] } & Record<string, unknown>;

export const WHT = {
  th: ['รู้ว่างานไหนยังขาดเอกสาร', 'จะได้ตามถูกงาน'],
  got: { label: 'ได้ใบ 50 ทวิแล้ว', wide: 'wht-received', narrow: 'nwht-received' },
  waiting: { label: 'ยังต้องตามใบ 50 ทวิ', wide: 'wht-waiting', narrow: 'nwht-waiting' },
  note: 'รับเงินแล้ว ไม่ได้แปลว่าได้เอกสารครบ ใบ 50 ทวิเป็นเอกสารที่ผู้ว่าจ้างออกให้คุณ แอปช่วยเก็บและบอกว่างานไหนยังรอ',
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
  // Lists follow the app's own plan cards (i18n plans.free1-5 + plans.freeDocumentsAvailable, plans.pro1-5).
  // Price and terms are the statements the previous landing made on this billing branch, kept word for word.
  // Free's 10 documents a month is live since 2026-10-15 (counted and enforced by the API). The app's 14-day
  // trial for new accounts is not advertised, as on the previous landing.
  plans: {
    free: { name: 'Free', price: '฿0', items: ['บันทึกงาน รายรับ รายจ่าย และติดตามเครดิตเทอม', 'ดูแดชบอร์ดกระแสเงินสดและภาพรวมรายเดือน', 'จัดสรรเงินและตั้งเป้าหมายออม', 'ใช้ปฏิทินงาน รายการลูกหนี้ และรายงานภาพรวม', 'สำรองและกู้คืนข้อมูลออฟไลน์', 'ออกเอกสารใหม่ 10 ฉบับ/เดือน แก้ไขและดาวน์โหลดซ้ำไม่นับเพิ่ม'] },
    pro: {
      name: 'Pro', badge: 'ลดไป 20%', regularPrice: '฿249', price: '฿199', per: '/ เดือน', priceNote: ['3 รอบบิลรายเดือนแรก', 'รอบบิลที่ 4 เป็นต้นไป ฿249 / เดือน'],
      // Priced by the owner on 2026-10-15; checkout sells monthly only, so these are not for sale yet.
      longPeriods: [
        { name: 'ราย 6 เดือน', price: '฿990', per: '/ 6 เดือน', average: 'เฉลี่ย ฿165/เดือน', badge: 'คุ้มกว่า' },
        { name: 'รายปี', price: '฿1,790', per: '/ ปี', average: 'เฉลี่ย ฿149/เดือน', badge: 'ประหยัดที่สุด' },
      ],
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
  line: 0.685,      // dark scene, a phone with the LINE chat and its real menu
  tap: 0.715,       // the "รอรับเงิน" tile is tapped
  reply: 0.775,     // the bot's card with every job still waiting has arrived
  notice: 0.89,     // an overdue notice has arrived on its own
} as const;

/** How many screens of scrolling each pinned act takes. */
export const SCREENS = { money: 10, docs: 7 } as const;
