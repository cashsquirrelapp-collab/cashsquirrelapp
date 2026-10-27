import { tr } from '../../i18n/tr';
import { apiJson, getCurrentAccount } from '../../services/api';
import type { PublicProfile } from '../../../../shared/groups';

/** Saves the account's name from เลขา's rename card through the same profile API as Settings (2–60 characters, checked
 *  again by the server), then tells the app, so the new name shows everywhere and เลขา calls the user by it. */
export async function saveAccountName(name: string): Promise<string> {
  const account = getCurrentAccount();
  if (!account) throw new Error(tr("กรุณาเข้าสู่ระบบอีกครั้ง"));
  const value = await apiJson<PublicProfile>('/api/profile', { method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ displayName: name }) });
  window.dispatchEvent(new CustomEvent('cash-squirrel:profile-updated', { detail: value }));
  return value.displayName;
}

/** "เรียกผมว่า…", "อยากเปลี่ยนชื่อ": for the sample answers only (the server has its own, rename.ts). */
export function sampleRename(text: string): { name: string } | undefined {
  const value = text.trim();
  const call = /^(?:จำไว้(?:นะ)?\s*)?(?:ต่อไป(?:นี้)?\s*)?(?:ให้)?(?:ช่วย)?เรียก(?:กู|ผม|ฉัน|เรา|หนู|ดิฉัน)ว่า\s*["“']?([^\s"”'.,!?]{1,24}?)["”']?(?:\s|นะ|ครับ|ค่ะ|ด้วย|เลย)*$/.exec(value);
  if (call) return { name: call[1] };
  const change = /^(?:อยาก|ขอ|ช่วย)?(?:เปลี่ยน|แก้)ชื่อ(?:บัญชี|ผม|ฉัน|ตัวเอง)?(?:\s*(?:เป็น|ว่า)\s*([^\s"”'.,!?]{1,24}?))?(?:\s|นะ|ครับ|ค่ะ|หน่อย)*$/.exec(value);
  return change ? { name: change[1] ?? '' } : undefined;
}
