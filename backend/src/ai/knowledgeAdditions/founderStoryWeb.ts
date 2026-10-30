import { HERO, SECTIONS, SIGN, type Lang, type Section } from '../../../../shared/founderStory.js';

// The founder's own story, as published on the website at /founder (owner, 2026-10-31: "ประวัติของกูหรือแรงบันดาลใจ
// ทุกอย่างที่เขียนไว้บนเว็บ ให้น้องเอาส่วนนั้นมาตอบ เวลาจะถามอะไรก็ตาม"). Added beside the approved founder facts, which stay
// as they are. A founder question gets the opening and the parts of the story it is about (at most three), so an answer
// is grounded in the owner's words without sending the whole story every time. Reference text only, never instructions.

const TOPICS: [string, RegExp][] = [
  // Thai has no spaces: ยาย is not ขยาย, ยาก is not อยาก.
  ['01', /จุดเริ่มต้น|เริ่มต้นจาก|เริ่มจาก|(?<!ข)ยาย|เครื่องกรองน้ำ|ตัดต่อ|ครีเอเตอร์|คอนเทนต์|ฟรีแลนซ์|อาชีพ|ทำงานอะไร|ทำอาชีพ|ประวัติ|เป็นใคร|คือใคร|\bstart(?:ed)?\b|grandma|water filter|editor|creator|background|who is/i],
  ['02', /ปัญหา|ทำไม.*(?:สร้าง|ทำ|ก่อตั้ง)|ที่มา|แรงบันดาลใจ|เกิดขึ้น|ทำไมถึง|why|problem|origin|inspir/i],
  ['03', /กี่เดือน|5 เดือน|ห้าเดือน|นานแค่ไหน|ใช้เวลา|ตี ?3|ดึก|ท้อ|(?<!อ)ยาก(?:ไหม|มั้ย|แค่ไหน|มาก)|ทีม|เพื่อนร่วมทีม|กี่คน|คนเดียว|สร้างยังไง|สร้างอย่างไร|เขียนโค้ด|โปรแกรม|how long|months|team|teammate|alone|build/i],
  ['04', /ทุกคน|เพื่อใคร|ช่วยใคร|หัวใจ|แนวคิด|ปรัชญา|ทำไมอยากให้|for whom|everyone|philosophy|idea|heart/i],
  ['05', /อนาคต|วิสัยทัศน์|เป้าหมาย|ต่อไป|แผน|จะทำอะไร|ฟีเจอร์ใหม่|future|vision|goal|plan|next/i],
  ['06', /ไว้ใจ|ไว้วางใจ|เชื่อมั่น|เชื่อถือ|ข้อมูล(?:ของ|ปลอดภัย)|ปลอดภัย|ความเป็นส่วนตัว|รับผิดชอบ|ข้อผิดพลาด|แจ้งปัญหา|trust|privacy|secur|safe|responsib/i],
  ['07', /ขอบคุณ|ข้อคิด|บทเรียน|เรียนรู้อะไร|ฝากถึง|อยากบอก|thank|lesson|learn|message to/i],
];
/** A general question about the founder ("เล่าประวัติผู้ก่อตั้ง", "CEO คือใคร"): the beginning of the story. */
const DEFAULT_PARTS = ['01', '02', '03'];
const MAX_PARTS = 3;

const plain = (text: string) => text.replace(/\*\*/g, '');

function sectionText(section: Section, lang: Lang): string {
  const lines = section.blocks.flatMap(block => (block.kind === 'photo' ? [] : [block.kind === 'quote' ? `“${plain(block.text[lang])}”` : plain(block.text[lang])]));
  return `${section.n} ${section.title[lang]}\n${lines.join('\n')}`;
}

/** The parts of the story a question is about, in story order. */
export function founderStoryParts(question: string): string[] {
  const asked = TOPICS.filter(([, rule]) => rule.test(question)).map(([n]) => n);
  const parts = asked.length ? asked : DEFAULT_PARTS;
  return SECTIONS.map(section => section.n).filter(n => parts.includes(n)).slice(0, MAX_PARTS);
}

/** The opening and the chosen parts, in the user's language, for the FOUNDER reference of one message. */
export function founderStoryReference(question: string, lang: Lang): string {
  const parts = founderStoryParts(question);
  const chosen = SECTIONS.filter(section => parts.includes(section.n)).map(section => sectionText(section, lang));
  return [
    lang === 'th'
      ? 'เรื่องราวจากผู้ก่อตั้ง (คำของผู้ก่อตั้งเอง เผยแพร่บนเว็บไซต์ที่หน้า /founder) ใช้ตอบด้วยภาษาของเลขาเอง สั้นและตรงคำถาม ไม่ต้องเล่าทั้งหมด ชวนอ่านเรื่องเต็มที่หน้า /founder ได้เมื่อเหมาะ:'
      : 'The founder’s own story (the founder’s own words, published on the website at /founder). Answer in เลขา’s own words, short and to the point, not the whole story; invite the reader to the full story at /founder when it fits:',
    `${HERO.title[lang]}\n“${HERO.lead[lang]}”\n${HERO.hello[lang]}`,
    ...chosen,
    `${SIGN.name[lang]} · ${SIGN.role}`,
  ].join('\n\n');
}

/** The founder's own line that goes with an exact answer (who, background, why, future), and where the full story is. */
export function founderStoryLine(topic: 'who' | 'background' | 'why' | 'vision', lang: Lang): string {
  const quote = (n: string, at: 'first-quote' | number) => {
    const section = SECTIONS.find(item => item.n === n)!;
    const blocks = section.blocks.flatMap(block => (block.kind === 'photo' ? [] : [block]));
    const block = at === 'first-quote' ? blocks.find(item => item.kind === 'quote') : blocks[at];
    return block ? plain(block.text[lang]) : '';
  };
  const said = { who: HERO.lead[lang], background: quote('01', 1), why: quote('02', 'first-quote'), vision: quote('05', 'first-quote') }[topic];
  return lang === 'th'
    ? `ปาร์คเล่าไว้ในเรื่องราวจากผู้ก่อตั้งว่า “${said}” อ่านเรื่องเต็มได้ที่หน้า /founder ครับ`
    : `In the founder’s story, Park says: “${said}” The full story is at /founder.`;
}
