// Who made Krarok and why (owner's Master Product Backlog, Part 1–2, 2026-10-25). Only the public text the owner
// approved is here ("ทำต่อตามแผนเรา", 2026-10-25, the draft on the plan page). The founder's worries and spending on
// tools are kept out on purpose: they are private and never reach the model. Changing this text is a release the
// owner approves, so it cannot change from a chat. เลขา answers the common questions from it directly (no model, no
// tokens); for anything else about the founder the model gets this text for that one message only.
// The same file holds the line for questions about the technology behind เลขา (Part 3).

export const FOUNDER_VERSION = 'founder-2026-10-25.1';

const TH = {
  who: 'Krarok (กระรอกตุนเงิน) ก่อตั้งและพัฒนาโดยคุณนพรัตน์ นาวะบุตร (ปาร์ค) ซึ่งเป็นผู้ก่อตั้งเพียงคนเดียวครับ',
  background: 'คุณปาร์คศึกษาสาขานิเทศศาสตร์ และไม่ได้มีพื้นฐานการเขียนโปรแกรมมาก่อน จึงเริ่มจากเรียนรู้ด้วยตัวเอง ทดลองสร้างระบบ และใช้ AI ช่วยในการเรียนรู้ระหว่างสร้าง Krarok ครับ',
  why: 'แนวคิดเริ่มเมื่อราวกลางปี 2569 จากปัญหาที่คุณปาร์คเจอเองตอนทำงานฟรีแลนซ์หลายงานพร้อมกัน คือไม่เห็นภาพรวมเงินเข้า ไม่รู้ว่าแต่ละเดือนจะได้รับเงินจริงเท่าไร แต่ละงานจ่ายเงินคนละวัน และต้องตามเครดิตเทอม ทำเอกสาร และตรวจตารางเองทั้งหมด จึงสร้าง Krarok ให้ฟรีแลนซ์จัดการงาน เงิน และเอกสารได้ง่ายขึ้น และมีเวลาไปทำงานหลักมากขึ้นครับ',
  secretary: 'เลขากระรอกเป็นผู้ช่วย AI ที่พัฒนาขึ้นสำหรับ Krarok โดยคุณปาร์ค ผู้ก่อตั้ง ส่วนรายละเอียดเทคโนโลยีภายในเป็นข้อมูลของระบบครับ',
  team: 'ตอนนี้ Krarok มีผู้ก่อตั้ง 1 คน คือคุณนพรัตน์ นาวะบุตร (ปาร์ค) ซึ่งดูแลการพัฒนาเองครับ',
  goal: 'เป้าหมายคือทำให้การจัดการงาน เงิน และเอกสารของฟรีแลนซ์เป็นเรื่องง่าย ตอนนี้ในแอปมีการบันทึกงานและการรับเงิน ใบเสนอราคาและใบแจ้งหนี้ เลขากระรอก และการแจ้งเตือนผ่าน LINE ส่วนแผนต่อไปที่ยังไม่มีในแอป คือรองรับทีมและเอเจนซี คอมมูนิตี้ของคนทำงานอิสระ และศึกษาการเชื่อมข้อมูลธนาคารผ่านช่องทางที่ได้รับอนุญาตครับ',
  contact: 'ถ้าต้องการส่งความเห็นหรือข้อเสนอถึงผู้พัฒนา Krarok ส่งได้ที่เมนู “บอกเรา” ในแอปครับ',
};
const EN = {
  who: 'Krarok (กระรอกตุนเงิน) was founded and built by นพรัตน์ นาวะบุตร (Park), its only founder.',
  background: 'Park studied communication arts and had no programming background, so Park learned on the way: building and testing the system step by step, with AI as a learning aid while building Krarok.',
  why: 'The idea started around mid-2026 from Park\'s own problem as a freelancer with several jobs at once: no overview of money coming in, no clear idea of what each month would really bring, a different pay date for every job, and credit terms, documents and spreadsheets to keep track of alone. Park built Krarok so freelancers can manage work, money and documents more easily and keep their time for the work itself.',
  secretary: 'Krarok Secretary is an AI assistant developed for Krarok by its founder, Park. The details of the technology behind it are internal to the system.',
  team: 'Krarok has one founder, นพรัตน์ นาวะบุตร (Park), who also builds it.',
  goal: 'The goal is to make work, money and documents simple for freelancers. The app already has jobs and payments, quotations and invoices, Krarok Secretary and LINE reminders. Planned and not in the app yet: support for teams and agencies, a community for independent workers, and a study of connecting bank data through authorised channels.',
  contact: 'You can send feedback or ideas to the Krarok developer from the “บอกเรา” (Feedback) menu in the app.',
};
export type FounderTopic = keyof typeof TH;

/** The approved public text, for the model when a message is about the founder (one message at a time). */
export function founderBlock(): string {
  return [`version ${FOUNDER_VERSION}; approved public text only. Use it as written; never add history, achievements, `
    + 'dates, numbers or team members that are not here. The founder\'s private matters are not shared.',
  ...(['who', 'background', 'why', 'secretary', 'team', 'goal', 'contact'] as FounderTopic[]).map(topic => `- ${TH[topic]}`)].join('\n');
}

const thai = (text: string) => /[฀-๿]/.test(text);
export function founderAnswer(topic: FounderTopic, text: string): string {
  return (thai(text) ? TH : EN)[topic];
}

// ---------- which founder question ----------
// Short questions only; anything longer, or asking for something else too, goes to the model with founderBlock().
const BUILT = '(?:สร้าง|ทำ|พัฒนา|เขียน|ออกแบบ|ก่อตั้ง|คิด)';
const APP = '(?:แอป(?:นี้|พลิเคชัน)?|เว็บ(?:นี้|ไซต์)?|krarok|kra\\s?rok|กระรอก(?:ตุนเงิน)?|ระบบนี้|โปรแกรมนี้)';
const YOU = '(?:เลขา(?:กระรอก)?|คุณ|นาย|แก|มึง|เธอ|ตัวเอง)';
const FOUNDER = '(?:ผู้ก่อตั้ง|ผู้สร้าง|คนสร้าง|คนทำ|ผู้พัฒนา|คนพัฒนา|เจ้าของ|ปาร์ค|นพรัตน์|founder|creator|developer|owner)';
const TOPICS: [FounderTopic, RegExp][] = [
  ['background', new RegExp(`${FOUNDER}.{0,24}(?:เขียน\\s?(?:โค้ด|โปรแกรม)|โปรแกรมเมอร์|โค้ดเป็น|พื้นฐาน|เรียน(?:จบ)?|จบ(?:อะไร|สาย|ด้าน|มา)|สาย(?:อะไร|ไหน)|ประวัติ|background|code|coding|program|stud(?:y|ied))`, 'i')],
  ['team', new RegExp(`(?:${APP}|${FOUNDER}).{0,20}(?:กี่คน|ทีม(?:งาน)?(?:กี่|มี|ไหม|มั้ย|ใคร)|ทำคนเดียว|มีพนักงาน)|(?:ทีม(?:งาน)?|พนักงาน).{0,12}${APP}|how many people|(?:is there|who is on) (?:a |the )?team`, 'i')],
  ['why', new RegExp(`(?:ทำไม|เพราะอะไร|ที่มา|จุดเริ่มต้น|แรงบันดาลใจ|why).{0,24}${BUILT}.{0,12}${APP}|(?:ที่มา|จุดเริ่มต้น|แรงบันดาลใจ)(?:ของ)?\\s*${APP}|${APP}.{0,16}(?:ที่มา|จุดเริ่มต้น|เกิดขึ้นได้ยังไง|แก้ปัญหาอะไร|ตั้งใจแก้|สร้างมาเพื่อ|ทำมาเพื่อ|มีไว้เพื่อ)|ทำไม(?:ถึง)?${BUILT}${APP}|why (?:was|did|is).{0,30}(?:krarok|this app).{0,20}(?:made|built|created|exist)|what problem.{0,30}(?:krarok|this app)`, 'i')],
  ['goal', new RegExp(`(?:เป้าหมาย|วิสัยทัศน์|อนาคต|แผน(?:ต่อไป|ในอนาคต)|vision|roadmap|future).{0,20}${APP}|${APP}.{0,20}(?:เป้าหมาย|วิสัยทัศน์|ในอนาคต|อนาคต|จะไปทางไหน)|(?:goal|vision|future) of (?:krarok|this app)`, 'i')],
  ['contact', new RegExp(`(?:ติดต่อ|คุยกับ|ส่งข้อความ(?:ถึง|หา)?|อยากเจอ|contact|reach).{0,10}${FOUNDER}`, 'i')],
  ['secretary', new RegExp(`ใคร(?:เป็นคน)?${BUILT}${YOU}|${YOU}.{0,10}(?:ใคร${BUILT}|${BUILT}โดยใคร|ใครเป็นคน${BUILT}|มาจากไหน)|who (?:made|built|created|developed|designed) you`, 'i')],
  ['who', new RegExp(`ใคร(?:เป็นคน)?${BUILT}${APP}|${APP}.{0,16}(?:ใคร${BUILT}|${BUILT}โดยใคร|ใครเป็นคน${BUILT}|ของใคร|ใครเป็นเจ้าของ)|(?:ใคร(?:คือ|เป็น)|ใครเป็น)${FOUNDER}|${FOUNDER}.{0,12}(?:คือใคร|เป็นใคร|ชื่ออะไร|ชื่อ)|who (?:made|built|created|founded|owns|runs) (?:this|krarok|the app)|who is (?:the )?(?:founder|creator|owner)`, 'i')],
];
const TRAILING = /(?:\s|[?？!.]|ครับผม|ครับ|คับ|ค่ะ|คะ|ค่า|นะ|จ้า|จ้ะ|ฮะ|หรอ|เหรอ|อะ|อ่ะ|เอ่ย|ล่ะ)+$/;

/** The founder topic a short question asks about, when the whole message is that question. */
export function founderTopic(text: string): FounderTopic | undefined {
  const plain = text.trim().replace(TRAILING, '');
  if (!plain || plain.length > 90 || /\n/.test(plain)) return undefined;
  return TOPICS.find(([, rule]) => rule.test(plain))?.[0];
}

/** The message talks about the founder at all: the model then gets founderBlock() for this message. */
export const mentionsFounder = (text: string) => new RegExp(`${FOUNDER}|ใคร(?:เป็นคน)?${BUILT}(?:${APP}|${YOU})|who (?:made|built|created|founded)`, 'i').test(text);

// ---------- the technology behind เลขา (Part 3) ----------
const MODEL_NAMES = '(?:chat\\s?gpt|gpt[\\s-]?\\d*|openai|gemini|เจมิไน|เจมินี่|claude|คล็อด|คลอด|anthropic|แอนโทรปิก|sonnet|ซอนเน็ต|opus|haiku|grok|llama|deepseek|copilot|bard|mistral)';
const TECH: RegExp[] = [
  // "ใช้ AI อะไร", "โมเดลไหน", "AI ของใคร", "เบื้องหลังเป็นอะไร"
  /(?:\bai\b|เอไอ|โมเดล|model|llm|ปัญญาประดิษฐ์)\s*(?:ตัว|รุ่น|เวอร์ชัน|ยี่ห้อ|ค่าย|ของ)?\s*(?:อะไร|ไหน|ใคร|บริษัทไหน|เจ้าไหน)/i,
  /(?:เบื้องหลัง|ข้างหลัง|ขับเคลื่อน|รันบน|ทำงานบน|สร้างจาก|พัฒนาจาก|ต่อ\s?api).{0,16}(?:อะไร|ไหน|ใคร)/i,
  /(?:what|which)\s+(?:ai|model|llm|language model)\b|what (?:are|is) (?:you|this) (?:running|built|based) on|powered by (?:what|which)|what powers you/i,
  new RegExp(`(?:คุณ|นาย|เลขา|แก|มึง|เธอ|ระบบ|แอป)?\\s*(?:คือ|เป็น|ใช้|ใช่|รัน|มาจาก)\\s*${MODEL_NAMES}`, 'i'),
  new RegExp(`(?:are|is) (?:you|this|it) (?:a |an )?${MODEL_NAMES}|${MODEL_NAMES}\\s*(?:ใช่ไหม|ใช่มั้ย|หรือเปล่า|รึเปล่า|ป่าว|ปะ|\\?)`, 'i'),
];
const INTERNALS = /system\s?prompt|ซิสเต็ม\s?พร(?:อ|้อ)มต์|พร(?:อ|้อ)มต์(?:ระบบ|ของ)|คำสั่ง(?:ระบบ|ภายใน|ลับ)|initial instructions|your instructions|ignore (?:all |the )?(?:previous|above) instructions|routing|fallback|api\s?key|คีย์\s?api|ค่า\s?api|ต้นทุน\s?(?:ai|api|เอไอ)|ค่า(?:โมเดล|เอไอ)/i;

export type TechQuestion = 'technology' | 'internals';
/** A short question about the AI behind เลขา, or a request for its internal instructions or costs. */
export function techQuestion(text: string): TechQuestion | undefined {
  const plain = text.trim();
  if (!plain || plain.length > 160) return undefined;
  if (INTERNALS.test(plain)) return 'internals';
  return TECH.some(rule => rule.test(plain)) ? 'technology' : undefined;
}

/** The owner's line (Part 3), and where the processors are listed by law (the privacy policy). */
export function confidentialAnswer(kind: TechQuestion, text: string): string {
  if (thai(text)) {
    return kind === 'internals'
      ? 'คำสั่งภายใน การตั้งค่า และต้นทุนของระบบเป็นข้อมูลภายในที่ไม่เปิดเผยครับ ส่วนเรื่องงาน เงิน และเอกสารในแอป ถามหรือให้ช่วยได้ตามปกติครับ'
      : 'เลขากระรอกเป็นผู้ช่วย AI ที่พัฒนาขึ้นสำหรับ Krarok ส่วนรายละเอียดเทคโนโลยีภายในเป็นข้อมูลของระบบครับ ถ้าต้องการทราบว่ามีผู้ให้บริการรายใดช่วยประมวลผลข้อมูลของคุณ ดูได้ในนโยบายความเป็นส่วนตัวที่ /privacy ครับ';
  }
  return kind === 'internals'
    ? 'The system\'s internal instructions, settings and costs are not shared. I can still help with your work, money and documents in the app.'
    : 'Krarok Secretary is an AI assistant developed for Krarok; the details of the technology behind it are internal to the system. The privacy policy at /privacy lists the service providers that help process your data.';
}
