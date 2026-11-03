import { apiJson } from '../../services/api';
import { fireMascot } from '../../mascotBus';

/** Every LINE card a Pro account receives, from sample data, to the owner's own linked LINE (owner, 2026-11-03).
 *  The server allows it only for the owner's account and once a minute. */
export async function sendLineSamplesToMe(copy: (th: string, en: string) => string): Promise<void> {
  try {
    await apiJson('/api/notify', { method: 'POST', body: JSON.stringify({ event: 'admin-line-samples' }) });
    fireMascot({ mood: 'happy', tone: 'success', title: copy('ส่งการ์ดตัวอย่างแล้ว', 'Sample cards sent'), message: copy('การ์ด 7 แบบเข้า LINE ของบัญชีนี้แล้ว', 'All 7 cards are in this account’s LINE') });
  } catch (error) {
    fireMascot({ mood: 'alert', tone: 'error', title: copy('ส่งการ์ดตัวอย่างไม่สำเร็จ', 'Could not send the sample cards'), message: error instanceof Error ? error.message : copy('กรุณาลองใหม่', 'Please try again') });
  }
}
