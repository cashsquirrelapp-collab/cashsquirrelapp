import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// เลขากระรอก switched on (/api/assistant says enabled): the same chat screen talks to the backend, shows the
// account's real answers without sample labels, saves a confirmation card only on ยืนยัน and reloads the data.
// The backend is mocked here; no AI is called.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'assistant@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const PROPOSAL = 'p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

type Mock = {
  status?: Record<string, unknown>;
  reply?: (body: any) => { status: number; json: unknown };
  transcribe?: () => Promise<{ text: string; tokens: number; tokensLeft: number; trialLeft: null }>;
  width?: number;
  height?: number;
  inbox?: unknown;
  /** Routes that must win over the generic ones above (registered last, before the page loads). */
  routes?: (page: Page) => Promise<void>;
  /** Another page than the chat (the floating panel's tests). */
  path?: string;
};
async function open(page: Page, mock: Mock = {}) {
  const posts: any[] = [];
  let dataReads = 0;
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'GET') dataReads += 1;
    return route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  if (mock.inbox) await page.route('**/api/assistant?view=line', route => route.fulfill({ json: mock.inbox }));
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null, ...mock.status } });
    }
    const body = request.postDataJSON();
    posts.push({ body, headers: request.headers() });
    if (body.action === 'transcribe') {
      return route.fulfill({ json: mock.transcribe ? await mock.transcribe() : {
        text: 'เดือนนี้ได้เงินเท่าไหร่', tokens: 1, tokensLeft: 993, trialLeft: null,
      } });
    }
    if (mock.reply) { const reply = mock.reply(body); return route.fulfill({ status: reply.status, json: reply.json }); }
    if (body.action === 'message') {
      return route.fulfill({ json: {
        text: 'เตรียมเพิ่มงาน **แปลเอกสาร** ไว้แล้วครับ กดยืนยันบนการ์ดเพื่อบันทึก', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null,
        cards: [{ kind: 'confirm', id: PROPOSAL, title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'แปลเอกสาร' }, { label: 'มูลค่า', value: '฿4,000' }] }],
      } });
    }
    if (body.action === 'confirm') return route.fulfill({ json: { status: 'applied', kind: 'add_job', jobId: 'job-new' } });
    if (body.action === 'line-due') return route.fulfill({ json: { card: { category: 'received', title: 'บันทึกรับเงินแล้ว', subtitle: 'จากปุ่มในแจ้งเตือน', metric: { label: 'ออกแบบโลโก้จริง', value: '฿ 12,000' }, blocks: [{ kind: 'rows', rows: [{ label: 'ยังค้างรับ', value: 'ไม่มี รับครบแล้ว', tone: 'positive', strong: true }] }], footer: { label: 'ดูงานในแอป', path: '/jobs' }, alt: 'บันทึกรับเงินแล้ว ฿ 12,000 · ออกแบบโลโก้จริง' } } });
    if (body.action === 'line-partial') return route.fulfill({ json: { text: `บันทึกยอดจาก ${body.text}` } });
    return route.fulfill({ json: { cancelled: true } });
  });
  if (mock.routes) await mock.routes(page);
  await page.setViewportSize({ width: mock.width ?? 1440, height: mock.height ?? 900 });
  const response = await page.goto(mock.path ?? '/assistant');
  // The page itself must allow the microphone, or the browser refuses the mic button (fakes below cannot catch that).
  expect(response?.headers()['permissions-policy']).toContain('microphone=(self)');
  if (!mock.path) await expect(page.locator('#asx-message')).toBeVisible();
  // Fonts must settle before card insertion and scrolling, not first load during the final overlap check.
  await loadLayoutFonts(page);
  return { posts, dataReads: () => dataReads };
}

const ask = async (page: Page, text: string) => {
  await page.locator('#asx-message').fill(text);
  await page.locator('.asx-send').click();
};

async function syntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { __microphoneStreams: MediaStream[]; __microphoneRequests: MediaStreamConstraints[] };
    state.__microphoneStreams = [];
    state.__microphoneRequests = [];
    // Only replace capture: MediaRecorder, the analyser and audio decoding remain the browser's real implementations.
    // The oscillator goes to a stream destination, never to the computer's speakers or a physical microphone.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async (constraints: MediaStreamConstraints) => {
      state.__microphoneRequests.push(constraints);
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.2;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      state.__microphoneStreams.push(destination.stream);
      const track = destination.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
        void context.close();
      };
      return destination.stream;
    } });
  });
}

const microphoneStopped = (page: Page) => page.evaluate(() => {
  const streams = (window as unknown as { __microphoneStreams: MediaStream[] }).__microphoneStreams;
  return streams.length === 1 && streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'));
});

test('live: real answer and card without sample labels, real token count, saved only on ยืนยัน, data reloads', async ({ page }) => {
  const mock = await open(page);
  // The live screen says what it is: no "sample" wording in the hint or the token indicator.
  await expect(page.locator('.asx-hint')).toHaveText('เลขากระรอกตอบผิดได้ ตรวจสอบก่อนกดยืนยันทุกครั้ง');
  await expect(page.locator('.asx-hint.is-admin')).toHaveCount(0);
  await expect(page.locator('.asx-token')).toContainText('994');
  await expect(page.locator('.asx-token')).toHaveAttribute('aria-label', 'Krarok Tokens คงเหลือ 994 จาก 1000');

  await ask(page, 'เพิ่มงานแปลเอกสาร 4000');
  const card = page.locator('.asx-rcard.is-confirm');
  await expect(card).toContainText('เพิ่มงานใหม่ 1 งาน');
  await expect(card).toContainText('฿4,000');
  await expect(card.locator('.asx-card-tag')).toHaveCount(0);
  await expect(page.locator('.asx-meta', { hasText: 'คำตอบตัวอย่าง' })).toHaveCount(0);
  await expect(page.locator('.asx-token')).toContainText('990');

  const message = mock.posts.find(post => post.body.action === 'message');
  // The chat is kept in the account under an id the app makes (2026-10-24).
  expect(message.body).toEqual({ action: 'message', text: 'เพิ่มงานแปลเอกสาร 4000', history: [], conversationId: expect.stringMatching(/^c_[0-9a-f-]{36}$/) });
  expect(message.headers['x-account-id']).toBe(user.id);
  expect(message.headers['x-csrf-protection']).toBe('1');
  expect(mock.posts.some(post => post.body.action === 'confirm')).toBe(false);

  const readsBefore = mock.dataReads();
  await card.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(card).toContainText('บันทึกแล้ว');
  expect(mock.posts.filter(post => post.body.action === 'confirm').map(post => post.body)).toEqual([{ action: 'confirm', proposalId: PROPOSAL }]);
  await expect.poll(() => mock.dataReads()).toBeGreaterThan(readsBefore);
  await page.screenshot({ path: test.info().outputPath('live-confirmed.png') });
});

test('live: cancelling an edit leaves the proposal pending, and a follow-up sends the earlier turns as history', async ({ page }) => {
  const mock = await open(page, { reply: body => body.action === 'message'
    ? { status: 200, json: { text: 'เตรียมเพิ่มงานแปลเอกสารไว้แล้วครับ', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null, cards: [EDITABLE] } }
    : { status: 200, json: {} } });
  await ask(page, 'เพิ่มงานแปลเอกสาร 4000');
  const card = page.locator('.asx-rcard.is-confirm');
  await expect(card.locator('.asx-rcard-actions button')).toHaveText(['บันทึกงาน', 'แก้ไข', 'ยกเลิก']);
  // Owner, 2026-10-27 (direction A): a waiting card can be cancelled; editing has its own "ยกเลิกการแก้ไข".
  await expect(card.getByRole('button', { name: 'ยกเลิก', exact: true })).toHaveCount(1);
  await card.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await card.getByRole('textbox', { name: 'มูลค่า (บาท)', exact: true }).fill('4500');
  await card.getByRole('button', { name: 'ยกเลิกการแก้ไข' }).click();
  await expect(card.locator('.asx-card-amount')).toHaveText('฿4,000');
  await expect(card.locator('.asx-rcard-actions button')).toHaveText(['บันทึกงาน', 'แก้ไข', 'ยกเลิก']);
  expect(mock.posts.filter(post => ['revise', 'confirm', 'cancel'].includes(post.body.action))).toEqual([]);
  await ask(page, 'ขอบคุณ');
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(2);
  const second = mock.posts.filter(post => post.body.action === 'message')[1].body;
  expect(second.history.map((turn: any) => turn.role)).toEqual(['user', 'assistant']);
  expect(second.history[0].text).toBe('เพิ่มงานแปลเอกสาร 4000');
  expect(second.history[1].text).toBe('เตรียมเพิ่มงานแปลเอกสารไว้แล้วครับ');
  expect(mock.posts.filter(post => ['revise', 'confirm', 'cancel'].includes(post.body.action))).toEqual([]);
});

test('live: tokens used up shows the server message and stops the composer', async ({ page }) => {
  await open(page, { reply: () => ({ status: 402, json: { error: 'โทเคนของรอบนี้หมดแล้ว จะได้รับใหม่วันที่ 15 พ.ย. 2569', code: 'ai_tokens_used' } }) });
  await ask(page, 'สวัสดี');
  await expect(page.getByText('โทเคนของรอบนี้หมดแล้ว จะได้รับใหม่วันที่ 15 พ.ย. 2569')).toBeVisible();
  await expect(page.locator('.asx-token')).toContainText('0');
  await expect(page.locator('#asx-message')).toBeDisabled();
});

// Accounting Brain (2026-10-26): official website cards open the Revenue Department's site in a new tab; an address
// that is not on the official list never becomes a link, even if a stored chat carried one.
test('live: official website cards open official sites in a new tab, and nothing else becomes a link', async ({ page }, testInfo) => {
  const card = (id: string, url: string) => ({ kind: 'official_link', id, org: 'กรมสรรพากร', title: id === 'efiling' ? 'ยื่นแบบออนไลน์ (e-Filing)' : 'เว็บปลอม',
    description: 'ยื่น ภ.ง.ด.90 / 91 / 94 และชำระภาษีออนไลน์', todo: 'กด "ยื่นแบบออนไลน์" แล้วเข้าสู่ระบบด้วยบัญชีของกรมสรรพากร', url });
  await open(page, { reply: body => (body.action === 'message' ? { status: 200, json: {
    text: 'ยื่นออนไลน์ได้ที่เว็บกรมสรรพากรครับ', route: 'chat', tokens: 2, tokensLeft: 990, trialLeft: null,
    cards: [card('efiling', 'https://efiling.rd.go.th/rd-cms/'), card('fake', 'https://rd.go.th.evil.example/login')],
  } } : { status: 200, json: { cancelled: true } }) });
  await ask(page, 'ยื่นภาษีออนไลน์ยังไง');
  const cards = page.locator('.asx-rcard.is-official');
  await expect(cards).toHaveCount(2);
  const official = cards.first().getByRole('link', { name: /เปิดเว็บไซต์ · ยื่นแบบออนไลน์/ });
  await expect(official).toHaveAttribute('href', 'https://efiling.rd.go.th/rd-cms/');
  await expect(official).toHaveAttribute('target', '_blank');
  await expect(official).toHaveAttribute('rel', /noopener/);
  await expect(cards.first()).toContainText('efiling.rd.go.th');
  await expect(cards.first()).toContainText('ทำในเว็บนี้');
  await expect(cards.nth(1).getByRole('link')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('official-link-card.png') });
});

test('live: a connection failure keeps the retry state', async ({ page }) => {
  await open(page, { reply: () => ({ status: 503, json: { error: 'เลขากระรอกตอบไม่ทันในตอนนี้ กรุณาลองใหม่อีกครั้ง', code: 'ai_provider' } }) });
  await ask(page, 'สวัสดี');
  await expect(page.locator('.asx-error')).toContainText('ลองอีกครั้ง');
});

test('switched off: the chat keeps its labelled sample answers', async ({ page }) => {
  await open(page, { status: { enabled: false } });
  await expect(page.locator('.asx-hint:not(.is-admin)')).toHaveText('ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI');
  // This test account is a system admin, so it also sees why: AI is on for admins only (the mock says pro).
  await expect(page.locator('.asx-hint.is-admin')).toContainText('ตอนนี้เปิด AI ให้แอดมินระบบเท่านั้น');
});

// A real 2×2 PNG (made with valid checksums), so the browser can decode and redraw it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGN4Fq8NRAwQCgArOgXBUA7+6wAAAABJRU5ErkJggg==', 'base64');

// Owner, 2026-10-24: pictures as pictures, as in Claude: a thumbnail before sending, the picture in the chat, drag and drop.
for (const width of [1440, 390]) test(`attach ${width}px: a picture is redrawn as JPEG, previewed before sending, shown as a picture after, and opens large`, async ({ page }) => {
  const mock = await open(page, { width });
  const input = page.locator('.asx-composer input[type=file]');
  await input.setInputFiles({ name: 'สลิปโอน.png', mimeType: 'image/png', buffer: PNG });
  const tile = page.locator('.asx-attach-tile');
  await expect(tile.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,\/9j\//);
  await expect(tile).not.toContainText('สลิปโอน');
  await expect(page.locator('.asx-file-chip:not(.is-sent)')).toHaveCount(0);
  await tile.getByRole('button', { name: 'เอารูปออก' }).click();
  await expect(tile).toHaveCount(0);

  // Dragged onto the chat, the picture is attached the same way.
  const drop = await page.evaluateHandle(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], 'ลากมา.png', { type: 'image/png' })); return data;
  }, PNG.toString('base64'));
  await page.dispatchEvent('.asx-chat', 'dragenter', { dataTransfer: drop });
  await expect(page.locator('.asx-drop')).toContainText('วางรูปหรือ PDF ที่นี่');
  await page.dispatchEvent('.asx-chat', 'dragover', { dataTransfer: drop });
  await page.dispatchEvent('.asx-chat', 'drop', { dataTransfer: drop });
  await expect(page.locator('.asx-drop')).toHaveCount(0);
  await expect(tile.locator('img')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`attach-${width}-before.png`) });

  // A picture alone can be sent: เลขา gets a plain request, the chat shows only the picture.
  await page.locator('.asx-send').click();
  const sent = page.locator('.asx-sent-image img');
  await expect(sent).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  expect((await sent.boundingBox())!.width).toBeGreaterThanOrEqual(190);
  await page.waitForTimeout(800);
  await expect(page.locator('.asx-file-chip.is-sent')).toHaveCount(0);
  await expect(page.locator('.asx-msg.is-me .asx-bubble')).toHaveCount(0);
  await expect(tile).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`attach-${width}-sent.png`) });
  const body = mock.posts.find(post => post.body.action === 'message').body;
  expect(body.text).toBe('ช่วยดูไฟล์นี้หน่อย');
  expect(body.attachment.name).toBe('ลากมา.jpg');
  expect(body.attachment.mimeType).toBe('image/jpeg');
  expect(body.attachment.data.startsWith('/9j/')).toBe(true);

  await page.getByRole('button', { name: 'ดูรูปที่แนบ' }).click();
  const viewer = page.getByRole('dialog', { name: 'รูปที่แนบ' });
  await expect(viewer.locator('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('attach: a PDF goes as it is; other files are refused on screen before anything is sent', async ({ page }) => {
  const mock = await open(page);
  const input = page.locator('.asx-composer input[type=file]');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('.asx-notice')).toContainText('แนบได้เฉพาะรูป (JPG, PNG, WEBP) หรือไฟล์ PDF');
  const pdf = Buffer.from('%PDF-1.4\n% ใบเสนอราคา ตัวอย่าง\n');
  await input.setInputFiles({ name: 'ใบเสนอราคา.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('.asx-notice')).toHaveCount(0);
  // A PDF is a file card before sending and in the chat (owner, 2026-10-24: as in Claude).
  await expect(page.locator('.asx-attach-file')).toContainText('ใบเสนอราคา.pdf');
  await expect(page.locator('.asx-attach-file')).toContainText('PDF');
  await page.locator('#asx-message').fill('ช่วยเพิ่มงานจากใบนี้');
  await page.locator('.asx-send').click();
  await expect(page.locator('.asx-sent-file')).toContainText('ใบเสนอราคา.pdf');
  await expect(page.locator('.asx-attach-file')).toHaveCount(0);
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(1);
  const body = mock.posts.find(post => post.body.action === 'message').body;
  expect([body.text, body.attachment.name, body.attachment.mimeType, body.attachment.data]).toEqual(['ช่วยเพิ่มงานจากใบนี้', 'ใบเสนอราคา.pdf', 'application/pdf', pdf.toString('base64')]);
});

test('mic: recording stays local until Stop, transcribes once, and leaves an editable draft for explicit Send', async ({ page }) => {
  await syntheticMicrophone(page);
  let releaseTranscription!: () => void;
  const pendingTranscription = new Promise<void>(resolve => { releaseTranscription = resolve; });
  const mock = await open(page, { transcribe: async () => {
    await pendingTranscription;
    return { text: 'เดือนนี้ได้เงินเท่าไหร่', tokens: 1, tokensLeft: 993, trialLeft: null };
  } });
  try {
    await page.getByRole('button', { name: 'พูดแทนการพิมพ์', exact: true }).click();
    await expect(page.getByRole('group', { name: 'พูดแทนการพิมพ์' }).getByText('กำลังฟังอยู่', { exact: true })).toBeVisible();
    const waveform = page.locator('canvas.asx-voice-wave');
    await expect(waveform).toBeVisible();
    // Wait for captured audio (not a timer fake), and verify the meter is drawing above its flat baseline.
    await expect(page.locator('.asx-voice-time')).toHaveText(/^0:0[1-9] \/ 2:00$/);
    await expect.poll(() => waveform.evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext('2d')!.getImageData(0, Math.floor(canvas.height / 4), canvas.width, 1).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    })).toBe(true);
    // Smooth (owner, 2026-10-27: "อยากได้มันสมูท 60 เฟรม"): the bars move on (almost) every screen frame, not in steps.
    const moving = await waveform.evaluate(async (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')!;
      let last = 0; let changes = 0;
      for (let i = 0; i < 30; i += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let print = 0; for (let k = 3; k < data.length; k += 8) print = (print * 31 + data[k]) | 0;
        if (print !== last) changes += 1;
        last = print;
      }
      return changes;
    });
    expect(moving).toBeGreaterThanOrEqual(24);
    await expect(page.getByRole('button', { name: 'ส่งข้อความ', exact: true })).toHaveCount(0);
    expect(mock.posts).toHaveLength(0);

    await page.getByRole('button', { name: 'หยุดและถอดข้อความ' }).click();
    await expect(page.getByRole('group', { name: 'พูดแทนการพิมพ์' }).getByText('กำลังถอดเสียงเป็นข้อความ…', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'หยุดและถอดข้อความ' })).toBeDisabled();
    await expect.poll(() => mock.posts.filter(post => post.body.action === 'transcribe').length).toBe(1);
    expect(mock.posts.filter(post => post.body.action === 'message')).toHaveLength(0);
    expect(await microphoneStopped(page)).toBe(true);

    const transcription = mock.posts[0];
    expect(Object.keys(transcription.body).sort()).toEqual(['action', 'audio', 'language']);
    expect(transcription.body.language).toBe('th-TH');
    expect(transcription.body.audio.mimeType).toBe('audio/wav');
    expect(transcription.headers['x-account-id']).toBe(user.id);
    expect(transcription.headers['x-csrf-protection']).toBe('1');
    // This validates the real MediaRecorder -> decode -> PCM16 WAV path, not just the declared MIME type.
    const wav = Buffer.from(transcription.body.audio.data, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    expect(wav.length).toBeGreaterThan(8_044);
    expect(wav.subarray(44).some(value => value !== 0)).toBe(true);

    releaseTranscription();
    const draft = page.locator('#asx-message');
    await expect(draft).toHaveValue('เดือนนี้ได้เงินเท่าไหร่');
    await expect(draft).toBeEditable();
    await expect(page.getByText('ถอดเสียงแล้ว ตรวจแก้ก่อนกดส่ง', { exact: true })).toBeVisible();
    await expect(page.locator('.asx-token')).toContainText('993');
    await expect(page.locator('.asx-msg.is-me')).toHaveCount(0);
    expect(mock.posts).toHaveLength(1);
    await draft.fill('เดือนนี้ได้เงินรวมเท่าไหร่');
    await expect(draft).toHaveValue('เดือนนี้ได้เงินรวมเท่าไหร่');
    expect(mock.posts.filter(post => post.body.action === 'message')).toHaveLength(0);

    await page.getByRole('button', { name: 'ส่งข้อความ', exact: true }).click();
    await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(1);
    expect(mock.posts.find(post => post.body.action === 'message').body.text).toBe('เดือนนี้ได้เงินรวมเท่าไหร่');
    expect(mock.posts.filter(post => post.body.action === 'transcribe')).toHaveLength(1);
  } finally {
    releaseTranscription();
  }
});

test('mic: Cancel releases the microphone, keeps the existing draft, and never transcribes or sends', async ({ page }) => {
  await syntheticMicrophone(page);
  const mock = await open(page);
  const original = 'ร่างข้อความเดิม\nที่ยังไม่ส่ง';
  await page.locator('#asx-message').fill(original);
  await page.getByRole('button', { name: 'พูดแทนการพิมพ์', exact: true }).click();
  await expect(page.getByRole('group', { name: 'พูดแทนการพิมพ์' }).getByText('กำลังฟังอยู่', { exact: true })).toBeVisible();
  await expect(page.locator('.asx-voice-time')).toHaveText(/^0:0[1-9] \/ 2:00$/);
  expect(mock.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'ยกเลิกเสียงนี้' }).click();
  await expect(page.locator('#asx-message')).toHaveValue(original);
  await expect(page.locator('#asx-message')).toBeFocused();
  await expect(page.locator('.asx-voice-composer')).toHaveCount(0);
  expect(await microphoneStopped(page)).toBe(true);
  // Let the recorder's final chunk/stop callbacks finish; cancelling must not turn them into a request.
  await page.waitForTimeout(350);
  expect(mock.posts).toHaveLength(0);
  await expect(page.locator('.asx-msg.is-me')).toHaveCount(0);
});

test('read aloud: an answer is spoken without Markdown marks', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__spoken = [];
    window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => { (window as any).__spoken.push({ text: utterance.text, lang: utterance.lang }); };
  });
  await open(page);
  await ask(page, 'เดือนนี้ได้เงินเท่าไหร่');
  await page.getByRole('button', { name: 'ฟังคำตอบ' }).last().click();
  const spoken = await page.evaluate(() => (window as any).__spoken);
  expect(spoken).toEqual([{ text: 'เตรียมเพิ่มงาน แปลเอกสาร ไว้แล้วครับ กดยืนยันบนการ์ดเพื่อบันทึก', lang: 'th-TH' }]);
});

// Owner, 2026-10-24: the client in a picture was asked for again two messages later. What เลขา read from a file comes
// back with the reply as a hidden note; the next message carries it, never the file, and the screen never shows it.
test('attach: what เลขา read from a file goes with the next messages, the file itself only once', async ({ page }) => {
  const NOTE = 'ลูกค้า: มูลนิธิตัวอย่างเพื่อการศึกษา\nที่อยู่: 1 หมู่ 1 ต.ตัวอย่าง อ.เมือง จ.เชียงใหม่ 50000';
  const mock = await open(page, { reply: body => body.attachment
    ? { status: 200, json: { text: 'ได้ชื่อลูกค้าจากรูปแล้วครับ', memo: NOTE, tokens: 4, tokensLeft: 990, trialLeft: null } }
    : { status: 200, json: { text: 'รับทราบครับ', tokens: 2, tokensLeft: 988, trialLeft: null } } });
  const pdf = Buffer.from('%PDF-1.4\n% ใบแจ้งหนี้เดิม\n');
  await page.locator('.asx-composer input[type=file]').setInputFiles({ name: 'ใบแจ้งหนี้เดิม.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#asx-message').fill('อันนี้นามลูกค้านะ');
  await page.locator('.asx-send').click();
  await expect(page.locator('.asx-thread').getByText('ได้ชื่อลูกค้าจากรูปแล้วครับ')).toBeVisible();
  await expect(page.locator('.asx-thread')).not.toContainText('มูลนิธิตัวอย่างเพื่อการศึกษา');
  await page.locator('#asx-message').fill('ตัดต่อ 5 คลิป ไม่มี VAT');
  await page.locator('.asx-send').click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(2);
  const next = mock.posts.filter(post => post.body.action === 'message')[1].body;
  expect(next.attachment).toBeUndefined();
  expect(next.history).toEqual([
    { role: 'user', text: 'อันนี้นามลูกค้านะ [แนบไฟล์: ใบแจ้งหนี้เดิม.pdf]' },
    { role: 'assistant', text: `[อ่านจากไฟล์ที่แนบ: ${NOTE}]\nได้ชื่อลูกค้าจากรูปแล้วครับ` },
  ]);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('switched off: attaching stays "coming soon" (sample answers cannot read files)', async ({ page }) => {
  await open(page, { status: { enabled: false } });
  await expect(page.getByRole('button', { name: 'แนบไฟล์ · เร็ว ๆ นี้' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'ใช้เสียงได้เมื่อเชื่อมต่อเลขา AI' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.asx-composer input[type=file]')).toHaveCount(0);
});

for (const [label, width, height] of [['computer', 1440, 900], ['phone', 390, 844]] as const) {
  test(`${label}: the picture preview, the sent picture and the listen button fit without overlapping text`, async ({ page }) => {
    await open(page, { width, height });
    await page.locator('.asx-composer input[type=file]').setInputFiles({ name: 'สลิปโอนเงินค่าออกแบบโลโก้เดือนตุลาคม.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.asx-attach-tile img')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${label}-chip.png`) });
    await page.locator('#asx-message').fill('ช่วยดูสลิปนี้ว่าตรงกับงานไหน');
    await page.locator('.asx-send').click();
    await expect(page.locator('.asx-rcard.is-confirm')).toBeVisible();
    await expect(page.locator('.asx-sent-image img')).toBeVisible();
    await expect(page.locator('.asx-msg.is-me .asx-bubble').last()).toHaveText('ช่วยดูสลิปนี้ว่าตรงกับงานไหน');
    await expect(page.getByRole('button', { name: 'ฟังคำตอบ' }).last()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath(`${label}-sent.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('admins see why the real assistant is not on for the account (members never do)', async ({ page }) => {
  await open(page, { status: { enabled: false, plan: 'admin' } });
  await expect(page.locator('.asx-hint.is-admin')).toHaveText('สำหรับแอดมิน: เลขา AI ยังไม่เปิดในบัญชีนี้ · เซิร์ฟเวอร์ยังปิด AI อยู่ (AI_ENABLED)');
});

const REAL_INBOX = {
  notices: [
    { id: 'month-2026-09', at: Date.parse('2026-10-01T02:00:00Z'), card: { category: 'report', title: 'สรุปการเงินประจำเดือน', subtitle: 'กันยายน 2569', metric: { label: 'กำไรสุทธิ', value: '฿ 9,999' }, blocks: [], alt: 'สรุปการเงินประจำเดือน (กันยายน 2569) · กำไรสุทธิ ฿ 9,999' } },
    { id: 'reminder-today', at: Date.now() - 60_000, card: { category: 'urgent', title: 'เตือนรับเงิน', subtitle: 'เครดิตเทอม · วันนี้', metric: { label: 'ยอดรอรับที่ต้องติดตาม', value: '฿ 12,000', note: '1 รายการ' },
      blocks: [{ kind: 'section', title: 'เลยกำหนด · 1 รายการ', tone: 'negative', items: [{ id: 'job-late', name: 'ออกแบบโลโก้จริง', client: 'ร้านกาแฟของจริง', amount: '฿ 12,000', meta: 'เลย 4 วัน', metaTone: 'negative', due: true, prompt: 'รับเงินบางส่วน #ABC123 ยอด ' }] }],
      footer: { label: 'ดูรายการรอรับเงิน', path: '/receivables' }, alt: 'เตือนรับเงิน: เลยกำหนด 1 · วันนี้ 0 · ใกล้ครบกำหนด 0 รายการ' } },
  ],
  quick: {
    unpaid: { category: 'reminder', title: 'รอรับเงิน', metric: { label: 'ยอดรอรับทั้งหมด', value: '฿ 34,600', note: '3 งาน' }, blocks: [{ kind: 'items', items: [{ id: 'u-0', name: 'งานค้างจริง', client: 'ลูกค้าจริง', amount: '฿ 34,600' }] }], alt: 'รอรับเงิน 3 งาน' },
    month: { category: 'report', title: 'สรุปเดือนนี้', blocks: [], alt: 'สรุปเดือนนี้' },
    wip: { category: 'working', title: 'กำลังดำเนินงาน', blocks: [], alt: 'กำลังดำเนินงาน' },
  },
  lineLinked: true, reminderOn: true,
};

test('notifications thread: this account\'s own reminder, real ได้รับแล้ว, quick replies and the typed partial amount', async ({ page }) => {
  const mock = await open(page, { inbox: REAL_INBOX });
  const row = page.locator('.asx-side').getByText('แจ้งเตือนอัตโนมัติ').first();
  await row.click();
  const card = page.locator('.asx-thread').getByText('ออกแบบโลโก้จริง').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.asx-sample-banner')).toHaveCount(0);
  await expect(page.locator('.asx-thread').getByText('ตัวอย่าง', { exact: true })).toHaveCount(0);
  const readsBefore = mock.dataReads();
  await page.getByRole('button', { name: 'ได้รับแล้ว' }).click();
  await expect(page.locator('.asx-thread').getByText('บันทึกรับเงินแล้ว')).toBeVisible();
  expect(mock.posts.filter(post => post.body.action === 'line-due').map(post => post.body)).toEqual([{ action: 'line-due', kind: 'paid', id: 'job-late', shown: 'ได้รับเงินแล้ว · ออกแบบโลโก้จริง' }]);
  await expect.poll(() => mock.dataReads()).toBeGreaterThan(readsBefore);
  // Quick replies answer from this account's data, without asking the AI.
  await page.locator('.asx-quick').getByRole('button', { name: 'รอรับเงิน' }).click();
  await expect(page.locator('.asx-thread').getByText('งานค้างจริง')).toBeVisible();
  expect(mock.posts.some(post => post.body.action === 'message')).toBe(false);
  // ...and the tap is kept in the account, so it is still there after a reload (2026-10-24).
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'line-quick').map(post => post.body)).toEqual([{ action: 'line-quick', kind: 'unpaid', text: 'รอรับเงิน' }]);
  // ได้ไม่ครบ: the code goes in the box, the amount is typed after it.
  await page.getByRole('button', { name: 'ได้ไม่ครบ' }).click();
  await expect(page.locator('#asx-message')).toHaveValue('รับเงินบางส่วน #ABC123 ยอด ');
  await page.locator('#asx-message').pressSequentially('2000');
  await page.locator('.asx-send').click();
  await expect(page.locator('.asx-thread').getByText('บันทึกยอดจาก รับเงินบางส่วน #ABC123 ยอด 2000')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('line-thread-real.png') });
});

test('notifications thread: what was tapped before comes back, in time order among the notices', async ({ page }) => {
  const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  await open(page, { inbox: { ...REAL_INBOX, history: [
    { id: 'm-1', role: 'user', text: 'สรุปเดือนนี้', at: at(30) },
    { id: 'm-2', role: 'assistant', text: '', at: at(30), cards: [{ kind: 'line', card: { category: 'report', title: 'สรุปเดือนที่เก็บไว้', blocks: [], alt: 'สรุปเดือนที่เก็บไว้' } }] },
  ] } });
  await page.locator('.asx-side').getByText('แจ้งเตือนอัตโนมัติ').first().click();
  const thread = page.locator('.asx-thread');
  const kept = thread.getByText('สรุปเดือนที่เก็บไว้');
  await expect(kept).toBeVisible();
  await expect(thread.locator('.asx-msg.is-me').getByText('สรุปเดือนนี้', { exact: true })).toBeVisible();
  // September's summary (1 Oct) comes first, the kept tap (30 minutes ago) next, today's reminder last.
  const top = async (text: string) => (await thread.getByText(text).first().boundingBox())!.y;
  expect(await top('กันยายน 2569')).toBeLessThan(await top('สรุปเดือนที่เก็บไว้'));
  expect(await top('สรุปเดือนที่เก็บไว้')).toBeLessThan(await top('ออกแบบโลโก้จริง'));
  expect(await textOverlapIssues(page)).toEqual([]);
  await kept.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('line-thread-kept.png') });
});

// Owner, 2026-10-24: answer เลขา's questions with a tap, and change a card's amount before confirming, without typing.
const ASKED = { kind: 'questions', id: 'ask_1', questions: [
  { id: 'q1', text: 'ลูกค้าคือใคร', options: ['ร้านกาแฟตัวอย่าง'], allowText: true, placeholder: 'พิมพ์ชื่อลูกค้า' },
  { id: 'q2', text: 'ส่งงานแล้วหรือยัง', options: ['ส่งแล้ววันนี้', 'ยังไม่ส่ง'], allowText: false },
  { id: 'q3', text: 'หัก ณ ที่จ่ายไหม', options: ['ไม่หัก', '1%', '3%'], allowText: false },
] };
// Owner, 2026-10-25: a quotation asks when the client pays ("ชำระวันไหน" on a calendar, "มีเครดิตเทอมไหม" with every credit
// term the app offers) and the client's details as a small form; the issuer's only when none are saved.
const QUOTE_ASKED = { kind: 'questions', id: 'ask_2', questions: [
  { id: 'q1', text: 'ลูกค้าจะชำระเงินเมื่อไหร่', kind: 'payment', options: [], allowText: false, terms: [0, 30, 45, 60, 90] },
  { id: 'q2', text: 'ข้อมูลลูกค้าสำหรับใบเสนอราคา', kind: 'party', role: 'client', options: [], allowText: false, prefill: { name: 'ปล่อยจอย' } },
  { id: 'q3', text: 'ข้อมูลผู้ออกเอกสารของคุณ (บันทึกไว้ใช้ครั้งต่อไป)', kind: 'party', role: 'issuer', options: [], allowText: false },
] };
const EDITABLE = { kind: 'confirm', id: PROPOSAL, title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'แปลเอกสาร' }, { label: 'มูลค่า', value: '฿4,000' }],
  edit: [{ field: 'name', label: 'ชื่องาน', type: 'text', value: 'แปลเอกสาร' }, { field: 'value', label: 'มูลค่า (บาท)', type: 'money', value: '4000' },
    { field: 'wht_rate', label: 'หัก ณ ที่จ่าย (%)', type: 'choice', value: '0', options: ['0', '1', '3'] }] };
const REVISED = 'p_22222222-2222-4222-8222-222222222222';

for (const [label, width, height] of [['computer', 1440, 900], ['phone', 390, 844]] as const) test(`${label}: questions are answered by tapping, and a card is edited before confirming`, async ({ page }) => {
  let messages = 0;
  const mock = await open(page, { width, height, reply: body => {
    if (body.action === 'message') {
      messages += 1;
      return { status: 200, json: messages === 1
        ? { text: 'ขอข้อมูลเพิ่ม 3 ข้อครับ', route: 'action', tokens: 3, tokensLeft: 990, trialLeft: null, cards: [ASKED] }
        : { text: 'เตรียมการ์ดให้แล้วครับ', route: 'action', tokens: 4, tokensLeft: 986, trialLeft: null, cards: [EDITABLE] } };
    }
    if (body.action === 'revise') return { status: 200, json: { card: { ...EDITABLE, id: REVISED, changes: [{ label: 'งาน', value: 'แปลเอกสาร' }, { label: 'มูลค่า', value: '฿4,500' }], edit: EDITABLE.edit.map(field => (field.field === 'value' ? { ...field, value: '4500' } : field)) } } };
    if (body.action === 'confirm') return { status: 200, json: { status: 'applied', kind: 'add_job', jobId: 'job-new' } };
    return { status: 200, json: { cancelled: true } };
  } });
  await page.locator('#asx-message').fill('เพิ่มงานแปลเอกสาร 4000');
  await page.locator('.asx-send').click();
  const card = page.locator('.asx-rcard.is-questions');
  await expect(card).toBeVisible();
  const sendAnswers = card.getByRole('button', { name: 'ส่งคำตอบ' });
  await expect(sendAnswers).toBeDisabled();
  await card.getByRole('radio', { name: 'ร้านกาแฟตัวอย่าง' }).click();
  await card.getByRole('radio', { name: 'ส่งแล้ววันนี้' }).click();
  await card.getByRole('radio', { name: '3%' }).click();
  await expect(card.getByRole('radio', { name: '3%' })).toHaveAttribute('aria-checked', 'true');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`${label}-questions.png`) });
  await sendAnswers.click();
  await expect(card.getByRole('button', { name: 'ส่งคำตอบแล้ว' })).toBeDisabled();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(2);
  const answers = mock.posts.filter(post => post.body.action === 'message')[1].body;
  expect(answers.text).toBe('ลูกค้าคือใคร: ร้านกาแฟตัวอย่าง\nส่งงานแล้วหรือยัง: ส่งแล้ววันนี้\nหัก ณ ที่จ่ายไหม: 3%');
  expect(answers.history.at(-1).text).toContain('- ส่งงานแล้วหรือยัง');

  const confirm = page.locator('.asx-rcard.is-confirm');
  await confirm.getByRole('button', { name: 'แก้ไข' }).click();
  const amount = confirm.getByRole('textbox', { name: 'มูลค่า (บาท)' });
  await expect(amount).toHaveValue('4000');
  await amount.fill('4500');
  await page.waitForTimeout(500);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`${label}-edit.png`) });
  await confirm.getByRole('button', { name: 'ตรวจสอบข้อมูล' }).click();
  await expect(confirm).toContainText('฿4,500');
  const revise = mock.posts.find(post => post.body.action === 'revise').body;
  expect(revise).toEqual({ action: 'revise', proposalId: PROPOSAL, edits: { value: '4500' } });
  expect(mock.posts.filter(post => post.body.action === 'confirm')).toEqual([]);
  await confirm.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect.poll(() => mock.posts.find(post => post.body.action === 'confirm')?.body.proposalId).toBe(REVISED);
  await expect(confirm).toContainText('บันทึกแล้ว');
});

// Owner, 2026-10-24: chats are kept in the account, so they are there after reloading and on another device.
// Owner, 2026-10-25: "ทำให้มันมีปุ่มแก้ไข" on a quotation card, as on a job card.
const QUOTE = { kind: 'confirm', id: PROPOSAL, title: 'สร้างใบเสนอราคา QT-2569-TEST0001', changes: [
  { label: 'เอกสาร', value: 'ใบเสนอราคา QT-2569-TEST0001' }, { label: 'ผู้ออก / ลูกค้า', value: 'ผู้ออกตัวอย่าง → ลูกค้าตัวอย่าง' },
  { label: 'รายการ 1', value: 'ออกแบบโลโก้งาน · 1 หน่วย × ฿3,000.00' }, { label: 'ยอดชำระสุทธิ', value: '฿3,000.00' }],
  edit: [{ field: 'issuer_name', label: 'ผู้ออกเอกสาร', type: 'text', value: 'ผู้ออกตัวอย่าง' },
    { field: 'issuer_address', label: 'ที่อยู่ผู้ออกเอกสาร', type: 'text', value: '99 กรุงเทพฯ' },
    { field: 'client_name', label: 'ลูกค้า', type: 'text', value: 'ลูกค้าตัวอย่าง' },
    { field: 'item_1_description', label: 'รายการ', type: 'text', value: 'ออกแบบโลโก้งาน' }, { field: 'item_1_quantity', label: 'จำนวน', type: 'money', value: '1' },
    { field: 'item_1_price', label: 'ราคาต่อหน่วย (บาท)', type: 'money', value: '3000' },
    { field: 'vat_rate', label: 'VAT (%)', type: 'choice', value: '0', options: ['0', '7'] }, { field: 'wht_rate', label: 'หัก ณ ที่จ่าย (%)', type: 'choice', value: '0', options: ['0', '1', '2', '3', '5'] },
    { field: 'created_date', label: 'วันที่เอกสาร', type: 'date', value: '2026-10-25' }] };
for (const [label, width, height] of [['computer', 1440, 900], ['phone', 390, 844]] as const) test(`${label}: a quotation card is edited before confirming`, async ({ page }) => {
  const mock = await open(page, { width, height, reply: body => {
    if (body.action === 'message') return { status: 200, json: { text: 'เตรียมการ์ดใบเสนอราคาให้แล้วครับ', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null, cards: [QUOTE] } };
    if (body.action === 'revise') return { status: 200, json: { card: { ...QUOTE, id: REVISED, changes: QUOTE.changes.map(change => change.label === 'รายการ 1' ? { ...change, value: 'ออกแบบโลโก้งาน · 1 หน่วย × ฿3,500.00' } : change.label === 'ยอดชำระสุทธิ' ? { ...change, value: '฿3,500.00' } : change),
      edit: QUOTE.edit.map(field => (field.field === 'item_1_price' ? { ...field, value: '3500' } : field)) } } };
    if (body.action === 'confirm') return { status: 200, json: { status: 'applied', kind: 'create_quotation', documentId: 'quote-new' } };
    return { status: 200, json: { cancelled: true } };
  } });
  await page.locator('#asx-message').fill('ทำใบเสนอราคาออกแบบโลโก้ 3000 ให้ลูกค้าตัวอย่าง');
  await page.locator('.asx-send').click();
  const card = page.locator('.asx-rcard.is-confirm');
  await expect(card.getByRole('button', { name: 'แก้ไขข้อมูลผู้ออกเอกสาร' })).toContainText('ผู้ออกตัวอย่าง');
  await expect(card.getByRole('button', { name: 'แก้ไขข้อมูลลูกค้า' })).toContainText('ลูกค้าตัวอย่าง');
  await card.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await expect(card.getByRole('tab')).toHaveText(['ผู้ออก', 'ลูกค้า', 'รายการ', 'ภาษี']);
  await expect(card.getByRole('tab', { name: 'ผู้ออก', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(card.getByRole('textbox', { name: 'ชื่อ / บริษัท', exact: true })).toHaveValue('ผู้ออกตัวอย่าง');
  await expect(card.getByRole('textbox', { name: 'ที่อยู่', exact: true })).toHaveValue('99 กรุงเทพฯ');
  await card.getByRole('tab', { name: 'ลูกค้า', exact: true }).click();
  await expect(card.getByRole('tabpanel', { name: 'ลูกค้า', exact: true })).toBeVisible();
  await expect(card.getByRole('textbox', { name: 'ชื่อ / บริษัท', exact: true })).toHaveValue('ลูกค้าตัวอย่าง');
  await card.getByRole('tab', { name: 'รายการ', exact: true }).click();
  for (const name of ['รายการ', 'จำนวน', 'ราคาต่อหน่วย (บาท)']) await expect(card.getByRole('textbox', { name, exact: true })).toBeVisible();
  await card.getByRole('textbox', { name: 'ราคาต่อหน่วย (บาท)', exact: true }).fill('3500');
  await card.getByRole('tab', { name: 'ภาษี', exact: true }).click();
  await expect(card.getByRole('combobox', { name: 'VAT (%)' })).toHaveValue('0');
  await expect(card.getByRole('combobox', { name: 'VAT (%)' }).locator('option:checked')).toHaveText('ไม่มี VAT');
  await expect(card.getByRole('combobox', { name: 'หัก ณ ที่จ่าย (%)' }).locator('option:checked')).toHaveText('ไม่หัก');
  await card.getByRole('tab', { name: 'รายการ', exact: true }).click();
  await expect(card.getByRole('textbox', { name: 'ราคาต่อหน่วย (บาท)', exact: true })).toHaveValue('3500');
  // Switching editor groups preserves the draft; review does not commit the document.
  await card.getByRole('button', { name: 'ตรวจสอบข้อมูล' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath(`${label}-quote-edit.png`) });
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.getByRole('button', { name: 'ตรวจสอบข้อมูล' }).click();
  await expect(card.locator('.asx-card-amount')).toHaveText('฿3,500.00');
  const revise = mock.posts.find(post => post.body.action === 'revise').body;
  expect(revise).toEqual({ action: 'revise', proposalId: PROPOSAL, edits: { item_1_price: '3500' } });
  expect(mock.posts.filter(post => post.body.action === 'confirm')).toEqual([]);
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.getByRole('button', { name: 'สร้างใบเสนอราคา', exact: true }).click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'confirm').map(post => post.body)).toEqual([{ action: 'confirm', proposalId: REVISED }]);
  await expect(card).toContainText('บันทึกแล้ว');
});

// Owner, 2026-10-25: money over several months is a chart card from the server's figures, never ASCII bars or a table.
const CHART = { kind: 'money_chart', title: 'รายรับ–รายจ่าย', period: 'ก.ย.–ต.ค. 2569', omitted: 0,
  months: [{ month: '2026-09', label: 'ก.ย. 2569', income: 11640, expense: 1500.25, net: 10139.75, partial: false },
    { month: '2026-10', label: 'ต.ค. 2569', income: 6000.1, expense: 299.99, net: 5700.11, partial: true }],
  totals: { income: 17640.1, expense: 1800.24, net: 15839.86 } };
for (const [label, width, height, dark] of [['computer', 1440, 900, false], ['computer-dark', 1440, 900, true], ['phone', 390, 844, false]] as const) test(`${label}: two months of money are a chart card`, async ({ page }) => {
  await open(page, { width, height, reply: body => body.action === 'message'
    ? { status: 200, json: { text: 'สองเดือนที่ผ่านมารายรับรวม ฿17,640.10 ครับ ต.ค. ยังไม่จบเดือน', route: 'chat', tokens: 3, tokensLeft: 990, trialLeft: null, cards: [CHART] } }
    : { status: 200, json: {} } });
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.locator('#asx-message').fill('2 เดือนที่ผ่านมารายได้เป็นไงบ้าง');
  await page.locator('.asx-send').click();
  const card = page.locator('.asx-rcard.is-chart');
  await expect(card).toBeVisible();
  await expect(card.locator('.asx-rcard-period')).toHaveText('ก.ย. 2569 – ต.ค. 2569');
  await expect(card.locator('.asx-card-metrics dt')).toHaveText(['รายรับรวม', 'รายจ่ายรวม']);
  await expect(card.locator('.asx-card-metrics .is-income')).toHaveText('฿17,640.10');
  await expect(card.locator('.asx-card-metrics .is-expense')).toHaveText('฿1,800.24');
  await expect(card.locator('.asx-card-preview .asx-card-eyebrow')).toHaveText('เงินคงเหลือ');
  await expect(card.locator('.asx-card-amount')).toHaveText('฿15,839.86');
  await expect(card.locator('.asx-chart-group')).toHaveCount(2);
  await expect(card.locator('.asx-chart-bars i')).toHaveCount(4);
  await expect(card.locator('.asx-chart-legend')).toContainText('รายรับ');
  // The latest month by default; hovering another shows its figures.
  await expect(card.locator('.asx-chart-readout')).toHaveText('ต.ค. 2569 (ถึงวันนี้) · รายรับ ฿6,000.10 · รายจ่าย ฿299.99 · คงเหลือ ฿5,700.11');
  await card.locator('.asx-chart-group').first().hover();
  await expect(card.locator('.asx-chart-readout')).toHaveText('ก.ย. 2569 · รายรับ ฿11,640.00 · รายจ่าย ฿1,500.25 · คงเหลือ ฿10,139.75');
  const heights = await card.locator('.asx-chart-bars i').evaluateAll(bars => bars.map(bar => Math.round(bar.getBoundingClientRect().height)));
  expect(heights[0]).toBeGreaterThan(heights[2]); // September's income is the tallest bar
  expect(heights[0]).toBeGreaterThan(heights[1]);
  await expect(card.locator('.asx-chart-note')).toContainText('เดือนนี้ยังไม่จบ');
  await card.getByText('ดูเป็นตาราง').click();
  await expect(card.locator('table tbody tr')).toHaveCount(2);
  await expect(card.locator('table tbody tr').nth(1)).toContainText('฿5,700.11');
  await expect(page.locator('.asx-thread')).not.toContainText('█');
  await page.waitForTimeout(800);
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${label}-money-chart.png`) });
});

test('a period with no money shows the empty state, not empty bars', async ({ page }) => {
  await open(page, { reply: body => body.action === 'message'
    ? { status: 200, json: { text: 'ช่วงนี้ยังไม่มีรายการครับ', route: 'chat', tokens: 2, tokensLeft: 990, trialLeft: null,
      cards: [{ ...CHART, months: CHART.months.map(month => ({ ...month, income: 0, expense: 0, net: 0 })), totals: { income: 0, expense: 0, net: 0 } }] } }
    : { status: 200, json: {} } });
  await page.locator('#asx-message').fill('รายได้ปีที่แล้ว');
  await page.locator('.asx-send').click();
  const card = page.locator('.asx-rcard.is-chart');
  await expect(card.locator('.asx-chart-empty')).toHaveText('ยังไม่มีรายรับหรือรายจ่ายในช่วงนี้');
  await expect(card.locator('.asx-chart-group')).toHaveCount(0);
  await expect(card.locator('.asx-chart-table')).toHaveCount(0);
  await expect(card.locator('.asx-card-amount')).toHaveText('฿0.00');
  await expect(card.locator('.asx-card-metrics dd')).toHaveText(['฿0.00', '฿0.00']);
});

// Owner, 2026-10-25 ("อยากให้กดแก้ไขได้" on an expense card in the floating panel): the panel on every page edits a card
// and answers questions by tapping, as the full chat does; the category is picked from the app's list.
const EXPENSE = { kind: 'confirm', id: PROPOSAL, title: 'เพิ่มรายจ่าย', changes: [{ label: 'รายการ', value: 'ร้านสมาน' }, { label: 'จำนวนเงิน', value: '฿60' },
  { label: 'หมวดหมู่', value: 'อาหาร/รับรองลูกค้า' }, { label: 'วันที่', value: '2026-10-25' }],
  edit: [{ field: 'name', label: 'รายการ', type: 'text', value: 'ร้านสมาน' }, { field: 'amount', label: 'จำนวนเงิน (บาท)', type: 'money', value: '60' },
    { field: 'category', label: 'หมวดหมู่', type: 'choice', value: 'อาหาร/รับรองลูกค้า', options: ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ค่าโฆษณา/ยิงแอด', 'ค่าเดินทาง/น้ำมัน', 'อาหาร/รับรองลูกค้า', 'จ้างงานต่อ (Outsource)', 'ภาษี/ธรรมเนียม', 'ค่าบริการ/สาธารณูปโภค', 'อื่นๆ'] },
    { field: 'date', label: 'วันที่', type: 'date', value: '2026-10-25' }] };
test('floating panel: questions are answered by tapping and an expense card is edited, the category from a list', async ({ page }) => {
  let messages = 0;
  const mock = await open(page, { path: '/dashboard', reply: body => {
    if (body.action === 'message') {
      messages += 1;
      return { status: 200, json: messages === 1
        ? { text: 'ขอข้อมูลเพิ่ม 1 ข้อครับ', route: 'action', tokens: 2, tokensLeft: 990, trialLeft: null, cards: [{ kind: 'questions', id: 'ask_1', questions: [{ id: 'q1', text: 'จ่ายเท่าไหร่', options: ['60', '120'], allowText: true }] }] }
        : { text: 'เตรียมการ์ดบันทึกรายจ่ายให้แล้วครับ', route: 'action', tokens: 3, tokensLeft: 987, trialLeft: null, cards: [EXPENSE] } };
    }
    if (body.action === 'revise') return { status: 200, json: { card: { ...EXPENSE, id: REVISED, changes: EXPENSE.changes.map(change => change.label === 'หมวดหมู่' ? { ...change, value: 'ค่าอุปกรณ์/ซอฟต์แวร์' } : change),
      edit: EXPENSE.edit.map(field => (field.field === 'category' ? { ...field, value: 'ค่าอุปกรณ์/ซอฟต์แวร์' } : field)) } } };
    if (body.action === 'confirm') return { status: 200, json: { status: 'applied', kind: 'add_expense', expenseId: 'expense-new' } };
    return { status: 200, json: { cancelled: true } };
  } });
  await page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' }).click();
  const chat = page.getByRole('dialog', { name: /^เลขากระรอก · หน้า/ });
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('จ่ายร้านสมาน');
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).press('Enter');
  const questions = chat.locator('.asx-rcard.is-questions');
  await questions.getByRole('radio', { name: '60' }).click();
  await questions.getByRole('button', { name: 'ส่งคำตอบ' }).click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(2);
  expect(mock.posts.filter(post => post.body.action === 'message')[1].body.text).toBe('จ่ายเท่าไหร่: 60');
  const card = chat.locator('.asx-rcard.is-confirm');
  await card.getByRole('button', { name: 'แก้ไข' }).click();
  const category = card.getByRole('combobox', { name: 'หมวดหมู่' });
  await expect(category).toHaveValue('อาหาร/รับรองลูกค้า');
  await expect(category.locator('option')).toHaveCount(8);
  await expect(category.locator('option').first()).toHaveText('ค่าอุปกรณ์/ซอฟต์แวร์');
  await category.selectOption('ค่าอุปกรณ์/ซอฟต์แวร์');
  await card.getByRole('button', { name: 'ตรวจสอบข้อมูล' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('buddy-expense-edit.png') });
  await card.getByRole('button', { name: 'ตรวจสอบข้อมูล' }).click();
  await expect(card).toContainText('ค่าอุปกรณ์/ซอฟต์แวร์');
  expect(mock.posts.find(post => post.body.action === 'revise').body).toEqual({ action: 'revise', proposalId: PROPOSAL, edits: { category: 'ค่าอุปกรณ์/ซอฟต์แวร์' } });
  expect(mock.posts.filter(post => post.body.action === 'confirm')).toEqual([]);
  await card.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'confirm').map(post => post.body)).toEqual([{ action: 'confirm', proposalId: REVISED }]);
  await expect(card).toContainText('บันทึกแล้ว');
});

test('stored chats: the list comes from the account, a chat opens with its messages and card states, new messages are kept in it', async ({ page }) => {
  const STORED = 'c_44444444-4444-4444-8444-444444444444';
  const reads: string[] = [];
  const routes = async (target: Page) => {
  await target.route('**/api/assistant?view=conversations', route => { reads.push('list'); return route.fulfill({ json: { conversations: [
    { id: STORED, title: 'ค่าเรียนขับรถ 3 งวด', pinned: false, archived: false, createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:05:00.000Z' }] } }); });
  await target.route('**/api/assistant?view=conversation&id=*', route => { reads.push(new URL(route.request().url()).searchParams.get('id')!); return route.fulfill({ json: { messages: [
    { id: 'm-1', role: 'user', text: 'บันทึกงานค่าเรียนขับรถ 500,000 แบ่ง 3 งวด', at: '2026-10-20T03:00:00.000Z' },
    { id: 'm-2', role: 'assistant', text: 'เตรียมการ์ดให้แล้วครับ', at: '2026-10-20T03:00:05.000Z',
      cards: [{ kind: 'confirm', id: PROPOSAL, title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'ค่าเรียนขับรถ' }], status: 'applied' }] },
  ] } }); });
  };
  const mock = await open(page, { routes });
  const chat = page.locator('.asx');
  const row = chat.getByRole('button', { name: /ค่าเรียนขับรถ 3 งวด/ }).first();
  await expect(row).toBeVisible();
  await expect(chat.locator('.asx-side')).toContainText('ก่อนหน้านี้');
  await expect(chat.locator('.asx-side-note')).toHaveText('ประวัติแชตเก็บไว้ในบัญชีของคุณ');
  await row.click();
  await expect(chat.locator('.asx-msg.is-me .asx-bubble').first()).toHaveText('บันทึกงานค่าเรียนขับรถ 500,000 แบ่ง 3 งวด');
  await expect(chat.locator('.asx-rcard.is-confirm')).toContainText('บันทึกแล้ว');
  expect(reads).toEqual(['list', STORED]);
  await page.locator('#asx-message').fill('งวดที่ 2 โอนมาแล้ว');
  await page.locator('.asx-send').click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(1);
  const sent = mock.posts.find(post => post.body.action === 'message').body;
  expect(sent.conversationId).toBe(STORED);
  expect(sent.history.map((turn: any) => turn.text)).toEqual(['บันทึกงานค่าเรียนขับรถ 500,000 แบ่ง 3 งวด', 'เตรียมการ์ดให้แล้วครับ']);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('a new chat gets an id the account keeps it under', async ({ page }) => {
  const mock = await open(page);
  await page.locator('#asx-message').fill('สวัสดีครับ');
  await page.locator('.asx-send').click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(1);
  expect(mock.posts.find(post => post.body.action === 'message').body.conversationId).toMatch(/^c_[0-9a-f-]{36}$/);
});

for (const [label, width, height] of [['computer', 1440, 900], ['phone', 390, 844]] as const) test(`${label}: a quotation asks when the client pays with a calendar and the credit terms, and the client's details`, async ({ page }) => {
  const mock = await open(page, { width, height, reply: body => (body.action === 'message'
    ? { status: 200, json: { text: 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ', route: 'action', tokens: 3, tokensLeft: 990, trialLeft: null, cards: [QUOTE_ASKED] } }
    : { status: 200, json: { cancelled: true } }) });
  await page.locator('#asx-message').fill('ช่วยบันทึกงาน ตัดต่อ 3000 บาท ลูกค้าชื่อปล่อยจอยนะ ทำใบเสนอราคาให้หน่อย');
  await page.locator('.asx-send').click();
  // The mock answers every message with the same questions; the first card is the one answered here.
  const card = page.locator('.asx-rcard.is-questions').first();
  await expect(card).toBeVisible();
  const send = card.getByRole('button', { name: 'ส่งคำตอบ' });
  // Direction A (owner, 2026-10-27): the credit term is one segmented control, ไม่มี or the app's days.
  const payment = card.locator('fieldset.is-payment');
  await expect(payment.getByText('ชำระวันไหน', { exact: true })).toBeVisible();
  const terms = payment.getByRole('radiogroup', { name: 'เครดิตเทอม' }).getByRole('radio');
  await expect(terms).toHaveText(['ไม่มี', '30', '45', '60', '90']);
  await payment.getByRole('radio', { name: '30 วัน' }).click();
  await payment.locator('input[type="date"]').fill('2026-11-15');
  // The client's form starts with the name already known; the issuer's is empty and needs a name.
  const client = card.locator('fieldset.is-party').first();
  await expect(client.getByRole('textbox', { name: 'ชื่อ', exact: true })).toHaveValue('ปล่อยจอย');
  await client.getByRole('textbox', { name: /ที่อยู่/ }).fill('99 ถนนสุขุมวิท กรุงเทพฯ');
  await expect(send).toBeDisabled();
  const issuer = card.locator('fieldset.is-party').nth(1);
  await issuer.getByRole('textbox', { name: 'ชื่อ', exact: true }).fill('สตูดิโอตัวอย่าง');
  await issuer.getByRole('textbox', { name: /เลขประจำตัวผู้เสียภาษี/ }).fill('1234567890123');
  await expect(send).toBeEnabled();
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${label}-quote-questions.png`), fullPage: true });
  if (process.env.SHOT_DIR) { // the whole card for review, in a window tall enough to hold it
    await page.setViewportSize({ width, height: 2200 });
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${process.env.SHOT_DIR}/${label}-quote-card.png` });
    await page.setViewportSize({ width, height });
  }
  await send.click();
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'message').length).toBe(2);
  const answers = mock.posts.filter(post => post.body.action === 'message')[1].body;
  expect(answers.text).toBe([
    'ชำระวันไหน: 15 พ.ย. 2569 (2026-11-15) · เครดิตเทอม: 30 วัน',
    'ข้อมูลลูกค้าสำหรับใบเสนอราคา: ชื่อ ปล่อยจอย; ที่อยู่ 99 ถนนสุขุมวิท กรุงเทพฯ; เลขประจำตัวผู้เสียภาษี ไม่ระบุ; โทรศัพท์ ไม่ระบุ',
    'ข้อมูลผู้ออกเอกสารของคุณ (บันทึกไว้ใช้ครั้งต่อไป): ชื่อ สตูดิโอตัวอย่าง; ที่อยู่ ไม่ระบุ; เลขประจำตัวผู้เสียภาษี 1234567890123; โทรศัพท์ ไม่ระบุ',
  ].join('\n'));
  await expect(card.getByRole('button', { name: 'ส่งคำตอบแล้ว' })).toBeDisabled();
});

// The floating window has the same mic (owner, 2026-10-27: "ปุ่มไมค์อ่ะที่เอาไว้พูดมันอยู่ไหน"): recorded on the device,
// transcribed once on stop, left as a draft in the window to check before sending; while it transcribes the squirrel
// works on its hologram screen.
test('floating window mic: record, stop, one transcription, an editable draft in the window, nothing sent', async ({ page }) => {
  await syntheticMicrophone(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const mock = await open(page, { path: '/jobs', transcribe: async () => { await pending; return { text: 'คุณพิมพ์ชนกโอนมา 12,500 บาท', tokens: 1, tokensLeft: 993, trialLeft: null }; } });
  await page.locator('.asx-buddy-btn').click();
  const win = page.locator('.kfw');
  await expect(win).toBeVisible();
  const mic = win.getByRole('button', { name: 'พูดแทนการพิมพ์', exact: true });
  await expect(mic).toBeEnabled();
  await mic.click();
  await expect(win.getByRole('group', { name: 'พูดแทนการพิมพ์' }).getByText('กำลังฟังอยู่', { exact: true })).toBeVisible();
  await expect(win.locator('.asx-voice-time')).toHaveText(/^0:0[1-9] \/ 2:00$/);
  await expect(win.locator('.kfw-perch [data-holo]')).toHaveCount(0);
  await win.getByRole('button', { name: 'หยุดและถอดข้อความ' }).click();
  await expect(win.locator('.kfw-perch [data-holo]')).toHaveCount(1);
  await expect.poll(() => mock.posts.filter(post => post.body.action === 'transcribe').length).toBe(1);
  release();
  await expect(win.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toHaveValue('คุณพิมพ์ชนกโอนมา 12,500 บาท');
  await expect(win.getByText('ถอดเสียงแล้ว ตรวจแก้ก่อนกดส่ง')).toBeVisible();
  await expect(win.locator('.kfw-perch [data-holo]')).toHaveCount(0);
  expect(mock.posts.filter(post => post.body.action === 'message')).toHaveLength(0);
  expect(await microphoneStopped(page)).toBe(true);
  expect(await textOverlapIssues(page)).toEqual([]);
});

// Owner, 2026-10-27: "อิงชื่อตามชื่อ account ... ถ้าบอกว่าอยากเปลี่ยนชื่อ ให้มันเอาการ์ดมาแล้วให้กรอกชื่อใหม่ มันก็จะเปลี่ยนชื่อ
// account ใหม่". The card is typed or checked and saved by the user, through the same profile API as Settings.
test('name: "เรียกผมว่า…" brings a card to change the account name; saving it changes the name across the app', async ({ page }) => {
  const saved: unknown[] = [];
  let displayName = 'ผู้ใช้ตัวอย่าง';
  await open(page, {
    reply: body => body.action === 'message'
      ? { status: 200, json: { text: 'เปลี่ยนชื่อบัญชีเป็น “บอส” ใช่ไหมครับ ตรวจชื่อแล้วกดบันทึกได้เลย ต่อไปผมจะเรียกตามชื่อบัญชี', route: 'chat', tokens: 0, tokensLeft: 994, trialLeft: null,
        cards: [{ kind: 'rename', current: 'ผู้ใช้ตัวอย่าง', suggested: 'บอส' }] } }
      : { status: 200, json: { cancelled: true } },
    routes: async target => {
      await target.route('**/api/profile', route => {
        if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); saved.push({ body, account: route.request().headers()['x-account-id'] }); displayName = body.displayName; }
        return route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName } });
      });
    },
  });
  await ask(page, 'เรียกผมว่าบอส');
  const card = page.locator('.asx-rcard.is-rename');
  await expect(card).toBeVisible();
  await expect(card.locator('.asx-rcard-head')).toContainText('ชื่อบัญชี');
  await expect(card.locator('.asx-card-state')).toHaveText('รอบันทึก');
  await expect(card.getByRole('textbox', { name: 'ชื่อที่ใช้ในบัญชี' })).toHaveValue('บอส');
  await expect(card).toContainText('ผู้ใช้ตัวอย่าง');
  // Too short is refused on the card before anything is sent.
  await card.getByRole('textbox', { name: 'ชื่อที่ใช้ในบัญชี' }).fill('บ');
  await expect(card.getByRole('button', { name: 'บันทึกชื่อ' })).toBeDisabled();
  await card.getByRole('textbox', { name: 'ชื่อที่ใช้ในบัญชี' }).fill('บอสใหญ่');
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.getByRole('button', { name: 'บันทึกชื่อ' }).click();
  await expect(card.locator('.asx-card-state')).toHaveText('บันทึกแล้ว');
  await expect(card).toContainText('บันทึกชื่อแล้ว ต่อไปเลขากระรอกจะเรียกตามชื่อนี้');
  expect(saved).toEqual([{ body: { displayName: 'บอสใหญ่' }, account: user.id }]);
  // The app shows the new name (the sidebar's account corner, once the chat is left), as after saving it in Settings.
  await page.locator('section.asx').getByRole('button', { name: 'กลับ', exact: true }).first().click();
  await expect(page.locator('aside.app-sidebar').getByText('บอสใหญ่', { exact: true })).toBeVisible();
});
