const banner = document.createElement('aside');
const externalHosts = new Set();
const externalUrls = new Set();
banner.setAttribute('aria-label', 'สภาพแวดล้อมทดสอบ');
banner.id = 'migration-staging-banner';
banner.innerHTML = '<details><summary><strong>STAGING · ข้อมูลจำลอง</strong></summary><p>ยังไม่เชื่อมบัญชี การจ่ายเงิน LINE หรืออีเมลจริง</p><button type="button">เปิดข้อมูลตัวอย่าง</button><a href="/__staging/status">สถานะการทดสอบ</a></details>';
const style = document.createElement('style');
style.textContent = '#migration-staging-banner{position:fixed;bottom:calc(88px + env(safe-area-inset-bottom, 0px));right:12px;max-width:290px;z-index:40;background:#173c30;color:white;border:1px solid #c3dcc8;border-radius:12px;padding:8px 12px;font:12px/1.5 system-ui;box-shadow:0 4px 20px #0003}#migration-staging-banner summary{cursor:pointer;min-height:24px;line-height:24px}#migration-staging-banner p{margin:4px 0 8px}#migration-staging-banner button{background:#f6d894;color:#173c30;padding:7px 10px;border:0;border-radius:6px;cursor:pointer;font:inherit;font-weight:700}#migration-staging-banner a{color:#fff;margin-left:10px;text-decoration:underline}';
document.head.append(style); document.body.append(banner);
banner.querySelector('button').addEventListener('click', () => {
  if (banner.dataset.coreReady === 'true') {
    localStorage.removeItem('cashflow_guest_session');
    window.location.assign('/login');
    return;
  }
  localStorage.setItem('cashflow_guest_session', JSON.stringify({ user: { id: 'guest-migration-demo', email: 'migration-demo@example.invalid' }, isGuest: true }));
  window.location.assign('/dashboard/demo');
});
document.addEventListener('click', event => {
  const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!a) return;
  const url = new URL(a.href, location.href);
  const approvedExternal = url.protocol === 'https:' && (externalHosts.has(url.hostname) || externalUrls.has(url.href));
  if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== location.origin && !approvedExternal) {
    event.preventDefault(); event.stopImmediatePropagation();
    banner.querySelector('p').textContent = 'ลิงก์ไปบริการภายนอกปิดอยู่ใน staging นี้';
  }
}, true);

fetch('/__staging/health').then(r => r.json()).then(status => {
  if (!status.features?.core) return;
  banner.dataset.coreReady = 'true';
  banner.querySelector('button').textContent = 'เข้าสู่ระบบทดสอบ';
  if (status.features.stripe) { externalHosts.add('checkout.stripe.com'); externalHosts.add('billing.stripe.com'); }
  if (status.features.oauth) externalHosts.add('accounts.google.com');
  if (status.features.line) {
    externalUrls.add('https://line.me/R/ti/p/@859mlugf');
    externalUrls.add('https://liff.line.me/2012039027-neCxHo9L');
  }
  banner.querySelector('strong').textContent = 'STAGING · ฐานข้อมูลทดสอบ';
  const enabled = [['stripe','Stripe test'],['line','LINE ทดสอบ'],['email','อีเมลทดสอบ'],['oauth','Google ทดสอบ'],['cron','งานตามเวลา']].filter(([key]) => status.features[key]).map(([,name]) => name);
  const guest = localStorage.getItem('cashflow_guest_session');
  banner.querySelector('p').textContent = (guest ? 'โหมดสาธิตยังเชื่อม LINE ไม่ได้ กรุณาเข้าสู่บัญชีทดสอบ · ' : '') + 'ฐานข้อมูลแยก · บริการที่เปิด: ' + (enabled.join(', ') || 'บัญชีและข้อมูลเท่านั้น') + ' · ไม่ใช่เว็บจริง';
}).catch(() => { banner.querySelector('p').textContent = 'ตรวจสถานะไม่สำเร็จ กรุณาลองโหลดหน้าใหม่'; });
