// Two house rules checked on every answer, whatever the model wrote (owner's brief, 2026-10-25: "ลดอีโมจิให้มากที่สุด
// หากผู้ใช้ไม่ใช้อีโมจิ ไม่ต้องใส่อีโมจิ"; the real-model test found a reply with a made-up tool link):
// - no emoji when the user's message has none, or when they asked for none;
// - a Markdown link to a tool or another non-web target keeps its words only (the app makes real page links itself).

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]\u{FE0F}?(?:\u{200D}[\p{Extended_Pictographic}]\u{FE0F}?)*/gu;
const NO_EMOJI = /ไม่ใช้อีโมจิ|ไม่ใช้อิโมจิ|ไม่เอาอีโมจิ|no emoji/i;
// [label](target) where the target is not a web address or a path in the app.
const TOOL_LINK = /\[([^\]\n]{1,80})\]\((?!https?:\/\/|\/)([^)\s]{1,200})\)/g;

export function styleReply(text: string, context: { userText: string; preferences?: (string | undefined)[] }): string {
  let out = text.replace(TOOL_LINK, (_match, label: string) => label);
  const userEmoji = (context.userText.match(EMOJI) || []).length;
  const asked = (context.preferences ?? []).some(value => value && NO_EMOJI.test(value));
  if (asked || userEmoji === 0) {
    out = out.replace(EMOJI, '').replace(/[ \t]+$/gm, '').replace(/[ \t]{2,}/g, ' ');
  }
  return out.trim();
}
