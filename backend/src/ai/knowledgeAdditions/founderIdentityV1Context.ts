import { FOUNDER_ENTRIES_V1, FOUNDER_RESPONSE_GUIDANCE_V1, type FounderIdentityTopicV1 } from './founderIdentityV1.js';

// Additive, inactive proposal. Nothing in the live gateway imports this module.
// Selects reference text only; it does not change model routing, prompts, memory or account data.
// No request text or conversation history is copied into the returned reference block.
export interface FounderIdentitySelectionV1 {
  kind: 'context' | 'restricted' | 'unknown';
  entryIds: FounderIdentityTopicV1[];
  text: string;
}

const APP = /\b(?:krarok|kra\s+rok)\b|กระรอก(?:ตุนเงิน)?/i;
const NAMED_PERSON = /นพรัตน์|นาวะบุตร|ปาร์ค|\bpark\s+edit\b|\b(?:who is|about|did|does|is|can|why did|what does)\s+park\b|\bpark(?:'s|’s)\b/i;
const GENERIC_FOUNDER = /ผู้ก่อตั้ง|ผู้สร้างแอป|คนสร้างแอป|คนทำแอป|ผู้พัฒนาแอป|\b(?:the )?founder\b/i;
const CREATOR_QUESTION = /ใคร(?:เป็นคน)?(?:สร้าง|ทำ|พัฒนา|ก่อตั้ง)|(?:สร้าง|ทำ|พัฒนา|ก่อตั้ง)โดยใคร|who (?:made|built|created|founded|developed)/i;
const THIS_APP = /แอปนี้|แอพนี้|เว็บไซต์นี้|เว็บนี้|เลขา|\b(?:this app|you)\b/i;
const ACCOUNT_ACTION = /^(?:ช่วย\s*)?(?:เพิ่ม|บันทึก|แก้ไข|ลบ|ค้นหา|ค้น|หา|ออกใบ|สร้างใบ|สรุปยอด|ติดตามยอด)|^(?:please\s+)?(?:add|record|edit|delete|find|create an? invoice|summari[sz]e payments)\b/i;
const FOREIGN_FOUNDER = /\b(?:founder|creator|owner) of (?!krarok\b|this app\b|the app\b)[a-z]|ผู้ก่อตั้ง\s*(?:บริษัท\s*)?(?!krarok\b|kra\s+rok\b)[a-z]/i;
const INTERNAL_QUESTION = /ความลับ|สถาปัตยกรรม|ระบบ(?:ภายใน|หลังบ้าน)|system\s*prompt|routing|api\s*key|internal|architecture|business\s*secret/i;
const CREATION_INTENT = /ที่มา|จุดเริ่มต้น|แรงบันดาลใจ|ทำไม.*(?:สร้าง|พัฒนา|ก่อตั้ง)|สร้าง.*ทำไม|แก้ปัญหาอะไร|ตั้งใจแก้|เกิดขึ้น(?:ได้|มา)|why.*(?:built|made|created|developed|exist)|what problem|origin|inspiration/i;
const RESTRICTED = /รายได้(?:ส่วนตัว|ของปาร์ค|ผู้ก่อตั้ง)|(?:รายได้|รายรับ|ได้เงิน|มีเงิน|ตั้งเป้าเงิน).*(?:เท่าไหร่|เท่าไร|กี่)|ทรัพย์สิน|เงินเดือน|ยอดเงิน|มูลค่าทรัพย์สิน|เป้าหมาย.*(?:กี่|ตัวเลข|เท่า)|ที่อยู่|บ้านอยู่|เบอร์(?:โทร)?|ครอบครัว|แฟน|ตารางชีวิต|กิจวัตร|ความลับ|ต้นทุน(?:ระบบ|บริการ|\s*ai|\s*api)|สถาปัตยกรรม|ระบบ(?:ภายใน|หลังบ้าน)|ใช้(?:โมเดล|ฐานข้อมูล)|system\s*prompt|routing|api\s*key|internal|architecture|net\s*worth|income|salary|assets|financial\s*(?:target|goal)|home\s*address|phone|family|girlfriend|boyfriend|daily\s*routine|business\s*secret/i;
const TOPIC_RULES: readonly [FounderIdentityTopicV1, RegExp][] = [
  ['statement', /founder\s*statement|คำแถลง(?:ของ)?ผู้ก่อตั้ง/i],
  ['mottos', /motto|คติ|คำคม|คำพูด(?:จริง|ประจำตัว)|builder philosophy|future vision|ไม่ต้องเก่งก่อนเริ่ม|start small\. think big\. build something real|สร้างจากปัญหาจริง|ใช้เทคโนโลยีสร้างอิสรภาพ/i],
  ['work', /park\s*edit|พี่ปาร์คเอง|ตัดต่อ|ช่อง(?:อะไร|คอนเทนต์)|ธุรกิจ(?:อะไร|ที่)|ทำอะไร|what (?:does|did).*do|other (?:work|business)/i],
  ['background', /นิเทศ|นักศึกษา|เรียน|โปรแกรมเมอร์|วิศวกร|เขียน(?:โค้ด|โปรแกรม)|พื้นฐาน|background|programmer|engineer|coding|stud(?:y|ied|ent)/i],
  ['personality', /บุคลิก|ตัวตน|นิสัย|personality|mindset|ลักษณะเด่น|ทำงานแบบไหน/i],
  ['origin', /ทำไม|ที่มา|จุดเริ่มต้น|แรงบันดาลใจ|ปัญหา|เกิดขึ้น|why|origin|inspiration|what problem/i],
  ['audience', /เหมาะกับ|ใครใช้|เพื่อใคร|ช่วยใคร|กลุ่ม(?:คน|เป้าหมาย)|ผู้ใช้กลุ่ม|who.*(?:for|help)|audience|built for/i],
  ['philosophy', /ปรัชญา|แนวคิด(?:ในการ|การสร้าง|สร้าง|ธุรกิจ|ทำธุรกิจ)|philosophy|principle|simple for users/i],
  ['ai_view', /(?:มอง|คิด|แนวคิด|ทัศนคติ).*(?:\bai\b|เอไอ)|(?:view|think|approach).*(?:\bai\b|artificial intelligence)/i],
  ['success', /สำเร็จ|รวย|มหาเศรษฐี|ระดับโลก|success|billionaire|wealthy|rich|achievement/i],
  ['vision', /วิสัยทัศน์|อนาคต|เป้าหมาย|อยากให้|vision|future|goal|ambition/i],
  ['identity', /คือใคร|เป็นใคร|ชื่ออะไร|ของใคร|ใคร(?:เป็นคน)?(?:สร้าง|ทำ|พัฒนา|ก่อตั้ง)|ใครเป็นผู้ก่อตั้ง|สร้างโดยใคร|who (?:is|made|built|created|founded|developed)|founder\??$/i],
];

function topics(text: string): FounderIdentityTopicV1[] {
  const found = TOPIC_RULES.filter(([, rule]) => rule.test(text)).map(([id]) => id);
  // "Founder Statement" and mottos contain general biography words but must stay explicitly draft-only.
  if (found.includes('statement')) return ['statement'];
  if (found.includes('mottos')) return ['mottos'];
  return found;
}

function explicitlyRelated(text: string): boolean {
  if (!text || FOREIGN_FOUNDER.test(text)) return false;
  // A customer's/client's name in a work request is not a request for the founder's biography.
  if (ACCOUNT_ACTION.test(text)) return false;
  if (NAMED_PERSON.test(text) || GENERIC_FOUNDER.test(text)) return true;
  if (CREATOR_QUESTION.test(text) && (THIS_APP.test(text) || APP.test(text))) return true;
  if (!APP.test(text)) return false;
  // The app's name alone does not make feature help, login problems or account finances a founder question.
  return CREATION_INTENT.test(text) || INTERNAL_QUESTION.test(text)
    || /ของใคร|ใครเป็นเจ้าของ/.test(text)
    || topics(text).some(id => ['philosophy', 'audience', 'vision'].includes(id));
}

function isFollowUp(text: string): boolean {
  // Only a current, explicit biographical follow-up can borrow context from the immediately previous user turn.
  return /^(?:แล้ว)?(?:เขา|เค้า|ปาร์ค|ผู้ก่อตั้ง)|^(?:and\s+)?(?:he|his|what did he|what does he|did he|does he|why did he)\b/i.test(text)
    && (topics(text).length > 0 || RESTRICTED.test(text));
}

/** Returns no context for unrelated messages (zero added model tokens). No I/O or model calls. */
export function selectFounderIdentityV1(
  question: string,
  options: { previousUserQuestion?: string; language?: 'th' | 'en' } = {},
): FounderIdentitySelectionV1 | undefined {
  // NFC preserves Thai sara am (ำ); NFKC decomposes it and breaks normal Thai keyword matching.
  const query = question.normalize('NFC').trim();
  if (!explicitlyRelated(query)
    && !(isFollowUp(query) && explicitlyRelated((options.previousUserQuestion ?? '').normalize('NFC').trim()))) return undefined;
  const language = options.language ?? (/[ก-๙]/.test(query) ? 'th' : 'en');
  if (RESTRICTED.test(query)) {
    return { kind: 'restricted', entryIds: [], text: language === 'th'
      ? 'ไม่เปิดเผยหรือคาดเดารายได้ ทรัพย์สิน ตัวเลขเป้าหมายการเงิน ข้อมูลส่วนตัว ความลับธุรกิจ หรือสถาปัตยกรรมภายในของผู้ก่อตั้งและ Krarok ข้อมูลดังกล่าวไม่มีข้อมูลสาธารณะยืนยันในแหล่งนี้ ตอบอย่างสุภาพและไม่แต่งรายละเอียดเพิ่ม'
      : 'Do not disclose or guess the founder’s income, assets, numeric financial targets, private life, business secrets or internal architecture. This reference provides no confirmed public details of those matters. Respond politely without inventing details.' };
  }
  let ids = topics(query);
  if (/ประวัติ|biography|tell me about|เล่าเรื่อง/i.test(query) && !ids.includes('statement') && !ids.includes('mottos')) {
    ids = ['identity', 'background', 'work', 'origin'];
  }
  // A reference to the founder alone is not evidence for unknown dates, degrees, awards, team size, etc.
  if (/เกิด(?:วันที่|เมื่อ|ปี)|อายุ|มหาวิทยาลัย|จบ(?:ปี|เมื่อ|ที่ไหน)|ก่อตั้ง(?:ปี|วัน|เมื่อ)|ตั้ง(?:ปี|วัน|เมื่อ)|เริ่ม(?:ปี|เมื่อ)|กี่คน|รางวัล|birthday|birth date|how old|which university|graduat|when|what (?:year|date)|team size|how many|award/i.test(query)) ids = [];
  const selected = [...new Set(ids)].slice(0, 4);
  if (!selected.length) return { kind: 'unknown', entryIds: [], text: language === 'th'
    ? 'ไม่มีข้อมูลยืนยันสำหรับรายละเอียดที่ถามในข้อมูลผู้ก่อตั้งฉบับนี้ ให้ระบุว่าไม่มีข้อมูลยืนยัน ไม่คาดเดาหรือสร้างข้อเท็จจริงเพิ่ม'
    : 'This founder reference has no confirmed information for the requested detail. Say it is not confirmed; do not guess or invent facts.' };
  const entries = selected.map(id => FOUNDER_ENTRIES_V1.find(entry => entry.id === id)!);
  return { kind: 'context', entryIds: selected,
    text: [FOUNDER_RESPONSE_GUIDANCE_V1, ...entries.map(entry => language === 'th' ? entry.text_th : entry.text_en)].join('\n\n') };
}
