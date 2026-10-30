// Three house rules checked on every answer, whatever the model wrote (owner's brief, 2026-10-25: "ลดอีโมจิให้มากที่สุด
// หากผู้ใช้ไม่ใช้อีโมจิ ไม่ต้องใส่อีโมจิ"; the real-model test found a reply with a made-up tool link):
// - no emoji when the user's message has none, or when they asked for none;
// - a Markdown link to a tool or another non-web target keeps its words only (the app makes real page links itself);
// - เลขา never calls itself AI (owner, 2026-10-31: "แทนตัวเองว่าเลขากระรอก ... ห้ามเอ่ยตัวเองว่า AI"). The prompt says so
//   (SELF); this catches the usual phrases a model still writes. Only self-references change: AI as a topic stays.

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]\u{FE0F}?(?:\u{200D}[\p{Extended_Pictographic}]\u{FE0F}?)*/gu;
const NO_EMOJI = /ไม่ใช้อีโมจิ|ไม่ใช้อิโมจิ|ไม่เอาอีโมจิ|no emoji/i;
// [label](target) where the target is not a web address or a path in the app.
const TOOL_LINK = /\[([^\]\n]{1,80})\]\((?!https?:\/\/|\/)([^)\s]{1,200})\)/g;

// The word for "AI" in a self-reference, never followed by more Latin letters ("AI art", "AI startup" stay).
const AI_WORD = '(?:AI|A\\.I\\.|เอไอ|ปัญญาประดิษฐ์|แชต?บอ[ตท]|chat\\s?bot|บอ[ตท])(?![A-Za-z])';
// The space a model puts after a Latin word goes too when Thai follows ("ผมเป็น AI ครับ" → "ผมเป็นเลขากระรอกครับ").
const THAI_JOIN = '(?:[ \\t](?=[\\u0E00-\\u0E7F]))?';
// "ผมเป็น AI", "เลขากระรอกเป็นผู้ช่วย AI", "เราเป็นแค่บอท": the speaker starts the line or follows a space or a mark, so
// "ธุรกิจของเราคือ AI" (the user's business) is left alone.
const SELF_TH = new RegExp(`(?<=^|[\\s(“"'.,!?:])(เลขากระรอก|ผม|ฉัน|เรา|หนู|น้องกระรอก)\\s*(เป็น|คือ)\\s*(แค่|เพียง)?\\s*(?:ผู้ช่วย|เลขา(?:นุการ)?)?\\s*${AI_WORD}(?:\\s*(?:ผู้ช่วย|ตัวหนึ่ง|ตัวนึง))?${THAI_JOIN}`, 'gi');
const AS_AI_TH = new RegExp(`ในฐานะ(?:ที่เป็น)?\\s*(?:ผู้ช่วย\\s*)?${AI_WORD}`, 'gi');
const NAME_AI_TH = new RegExp(`เลขา(?:กระรอก)?\\s*(?:AI|เอไอ)(?![A-Za-z])${THAI_JOIN}`, 'gi');
const AS_AI_EN = /\b(as) an AI(?: (?:language model|assistant|model))?\b/gi;
const SELF_EN = /\b(?:I(?:'|’)m|I am) (?:just |only )?an? (?:AI|artificial intelligence|chat\s?bot|bot|language model)(?: (?:language model|assistant|model|chat\s?bot|secretary))?\b/gi;
const NAME_AI_EN = /\bKrarok Secretary is an AI(?: assistant)?\b/gi;

/** เลขา's own words about itself without "AI" (AI as a topic is left as written). */
export function selfName(text: string): string {
  return text
    .replace(SELF_TH, (_match: string, who: string, verb: string, only: string | undefined) =>
      (who === 'เลขากระรอก' ? `เลขากระรอก${verb}${only ?? ''}ผู้ช่วยส่วนตัว` : `${who}${verb}${only ?? ''}เลขากระรอก`))
    .replace(AS_AI_TH, 'ในฐานะเลขา')
    .replace(NAME_AI_TH, 'เลขากระรอก')
    .replace(AS_AI_EN, (_match: string, as: string) => `${as} Krarok Secretary`)
    .replace(SELF_EN, "I'm Krarok Secretary")
    .replace(NAME_AI_EN, 'Krarok Secretary is the personal assistant');
}

export function styleReply(text: string, context: { userText: string; preferences?: (string | undefined)[] }): string {
  let out = selfName(text.replace(TOOL_LINK, (_match, label: string) => label));
  const userEmoji = (context.userText.match(EMOJI) || []).length;
  const asked = (context.preferences ?? []).some(value => value && NO_EMOJI.test(value));
  if (asked || userEmoji === 0) {
    out = out.replace(EMOJI, '').replace(/[ \t]+$/gm, '').replace(/[ \t]{2,}/g, ' ');
  }
  return out.trim();
}
