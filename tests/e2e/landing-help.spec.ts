import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Contact, following and reports on the landing (owner, 2026-10-29): the footer's channels (only what the project holds:
// the contact email; Instagram and TikTok have no address yet, so they say เร็ว ๆ นี้ and are not links), and one report
// form opened from the menu's ช่วยเหลือ, the buttons under the price and the footer, sent to the existing system.

async function open(page: Page, size = { width: 1440, height: 900 }) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize(size);
  await page.goto('/');
}

test('the footer: email us, Instagram and TikTok not opened yet, and the way to the form', async ({ page }) => {
  await open(page);
  const footer = page.locator('#cl-help');
  await expect(footer.getByRole('link', { name: 'อีเมลหาเรา' })).toHaveAttribute('href', 'mailto:cashsquirrelapp@gmail.com');
  await expect(footer.getByText('Instagram — เร็ว ๆ นี้')).toBeVisible();
  await expect(footer.getByText('TikTok — เร็ว ๆ นี้')).toBeVisible();
  await expect(footer.getByRole('link', { name: /Instagram|TikTok/ })).toHaveCount(0);
  // the menu's ช่วยเหลือ leads here
  await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ช่วยเหลือ' })).toHaveAttribute('href', '#cl-help');
  await footer.getByRole('button', { name: 'แจ้งปัญหา / เสนอไอเดีย' }).click();
  const dialog = page.getByRole('dialog', { name: 'ส่งเรื่องถึงทีมกระรอก' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'แจ้งปัญหา / บั๊ก' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await footer.getByRole('button', { name: 'ส่งความคิดเห็นทั่วไป' }).click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'ความคิดเห็นทั่วไป' })).toBeChecked();
});

test('under the price: a bug report asks for the page, the steps and what happened, and is received', async ({ page }) => {
  const sent: unknown[] = [];
  await open(page);
  await page.route('**/api/feedback-public', async route => { sent.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { ok: true } }); });
  await page.getByRole('button', { name: 'แจ้งปัญหา / บั๊ก' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'ส่งเรื่องถึงทีมกระรอก' });
  await expect(dialog.getByRole('radio', { name: 'แจ้งปัญหา / บั๊ก' })).toBeChecked();
  for (const label of ['หน้าที่พบปัญหา', 'สิ่งที่ทำก่อนพบปัญหา', 'สิ่งที่เกิดขึ้น']) await expect(dialog.getByLabel(label)).toBeVisible();
  // an idea does not need them
  await dialog.getByText('เสนอไอเดีย / ขอฟีเจอร์').click();
  await expect(dialog.getByLabel('หน้าที่พบปัญหา')).toHaveCount(0);
  await dialog.getByText('แจ้งปัญหา / บั๊ก').click();
  await dialog.getByLabel('หัวข้อเรื่อง').fill('ปุ่มบันทึกงานกดไม่ได้');
  await dialog.getByLabel('รายละเอียดปัญหา').fill('กดบันทึกแล้วหน้าไม่ปิด');
  await dialog.getByLabel('หน้าที่พบปัญหา').fill('หน้างาน');
  await dialog.getByLabel('สิ่งที่ทำก่อนพบปัญหา').fill('กรอกงานใหม่แล้วกดบันทึก');
  await dialog.getByLabel('สิ่งที่เกิดขึ้น').fill('หน้าค้าง ไม่บันทึก');
  await dialog.getByLabel('อีเมลสำหรับติดต่อกลับ (ไม่บังคับ)').fill('someone@example.test');
  expect(await textOverlapIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'ส่งเรื่อง' }).click();
  await expect(dialog.getByText('ได้รับเรื่องแล้ว ขอบคุณที่ช่วยให้กระรอกดีขึ้น')).toBeVisible();
  expect(sent).toEqual([{ kind: 'bug', subject: 'ปุ่มบันทึกงานกดไม่ได้', details: 'กดบันทึกแล้วหน้าไม่ปิด', page: 'หน้างาน', steps: 'กรอกงานใหม่แล้วกดบันทึก', happened: 'หน้าค้าง ไม่บันทึก', email: 'someone@example.test' }]);
  // a sent report leaves nothing behind for next time
  await dialog.getByRole('button', { name: 'ปิด' }).last().click();
  await page.getByRole('button', { name: 'เสนอไอเดีย', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('หัวข้อเรื่อง')).toHaveValue('');
});

test('a failed send says so and keeps what was typed; sending again works', async ({ page }) => {
  let fail = true;
  await open(page);
  await page.route('**/api/feedback-public', route => (fail
    ? route.fulfill({ status: 503, json: { error: 'ตอนนี้ยังรับเรื่องจากหน้าเว็บไม่ได้ กรุณาลองใหม่ภายหลัง หรืออีเมลหาเรา' } })
    : route.fulfill({ status: 201, json: { ok: true } })));
  await page.getByRole('button', { name: 'เสนอไอเดีย', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'ส่งเรื่องถึงทีมกระรอก' });
  await dialog.getByLabel('หัวข้อเรื่อง').fill('อยากให้มีโหมดมืด');
  await dialog.getByLabel('รายละเอียด').fill('ใช้ตอนกลางคืนแล้วแสบตา');
  await dialog.getByRole('button', { name: 'ส่งเรื่อง' }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('ส่งไม่สำเร็จ');
  await expect(alert).toContainText('ตอนนี้ยังรับเรื่องจากหน้าเว็บไม่ได้');
  await expect(alert.getByRole('link', { name: 'cashsquirrelapp@gmail.com' })).toHaveAttribute('href', 'mailto:cashsquirrelapp@gmail.com');
  await expect(dialog.getByLabel('หัวข้อเรื่อง')).toHaveValue('อยากให้มีโหมดมืด');
  // closed and opened again (or the page reloaded): still there
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'เสนอไอเดีย', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('รายละเอียด')).toHaveValue('ใช้ตอนกลางคืนแล้วแสบตา');
  fail = false;
  await page.getByRole('dialog').getByRole('button', { name: 'ส่งเรื่อง' }).click();
  await expect(page.getByRole('dialog').getByText('ได้รับเรื่องแล้ว ขอบคุณที่ช่วยให้กระรอกดีขึ้น')).toBeVisible();
});

test('on a phone: ช่วยเหลือ in the bar, the form as a sheet inside the screen, nothing overlapping', async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  const help = page.locator('.cl-bar').getByRole('link', { name: 'ช่วยเหลือ' });
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('href', '#cl-help');
  await page.getByRole('button', { name: 'แจ้งปัญหา / บั๊ก' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'ส่งเรื่องถึงทีมกระรอก' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390 + 0.5).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await textOverlapIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'ปิด' }).click();
  await page.locator('#cl-help').scrollIntoViewIfNeeded();
  expect(await textOverlapIssues(page)).toEqual([]);
});
