// The logo shown while the app opens (phones since 2026-10-22, computers and iPads since 2026-11-11; look A was tried
// and taken back the same day: "เอาอันเดิมกลับมา"). boot-skeleton.js draws it before the app's code arrives; the app calls hideSplash() once the page under it is ready.
// - It stays long enough for its entrance to finish (MIN_VISIBLE_MS), so it never just flickers.
// - It waits for the page's own loading placeholders (aria-busy) to go, for at most MAX_WAIT_MS more,
//   so the logo hands over to real content rather than to a skeleton.
const MIN_VISIBLE_MS = 1100;
const MAX_WAIT_MS = 2500;
const LEAVE_MS = 450;
const SETTLED_MIN_MS = 300;

// The logo mark, the same drawing boot-skeleton.js uses (public/kv/symbol.svg).
const MARK = 'M462.2891 71.133 C634.9705 58.7986 816.0986 143.1701 886.4971 307.4335 C897.3079 332.6583 907.1436 358.7126 912.5548 385.7689 C920.9325 427.6565 923.5996 472.9793 918.867 515.5722 C905.5484 635.4416 835.3596 739.1615 746.659 816.7746 C668.3074 885.3322 565.9157 929.422 461.1561 929.422 C418.5151 929.422 358.5401 922.7653 350.4509 870.185 C349.3618 863.1059 350.0229 855.8166 351.422 848.8208 C361.2645 799.6082 414.5101 798.9129 453.8728 791.0405 C474.4152 786.932 494.9066 778.0173 512.9479 767.5722 C591.6984 721.9798 619.9668 620.2117 584.9711 538.5549 C565.5644 493.2728 518.8689 458.1077 474.2659 440.474 C407.4458 414.0567 327.7454 408.613 262.0809 441.4451 C228.6948 458.1383 197.2659 488.8157 205.4336 529.6531 C212.2983 563.9768 251.1019 578.0934 280.6937 585.4912 C296.1002 589.3431 311.9956 590.6752 327.792 591.8034 C338.9737 592.6021 350.4064 591.9653 361.6185 591.9653 C414.9505 591.9653 497.7971 591.2465 514.4045 657.6764 C516.8075 667.2878 518.5276 675.9879 518.1272 685.9999 C517.8095 693.9399 515.3149 701.5834 512.6243 708.9827 C494.0358 760.101 438.9823 761.9075 393.1792 761.9075 C375.1886 761.9075 353.6752 764.9772 336.6936 757.6995 C312.0255 747.1274 308.624 709.7501 329.7342 693.607 C341.905 684.2998 356.6295 684.2197 371.3295 684.2197 C386.7051 684.2197 402.081 684.2197 417.4566 684.2197 C429.6845 684.2197 446.2587 685.7037 455.977 676.6128 C473.0076 660.6807 453.9532 640.108 438.1733 634.37 C419.1027 627.4352 398.5829 628.3815 378.6127 628.3815 C357.4386 628.3815 336.6086 627.4621 315.4913 625.9538 C288.8679 624.0521 262.3965 620.1388 236.8324 612.3584 C167.6326 591.2977 109.5945 536.6032 88.4163 467.0173 C82.513 447.621 80 427.7057 80 407.4566 C80 276.3183 181.9107 173.2064 292.8325 117.7457 C316.3862 105.9688 340.4711 96.2803 365.6648 88.6128 C396.8589 79.1189 429.8085 73.453 462.2891 71.133 Z';
const NAME_FONT = 'https://fonts.googleapis.com/css2?family=Prompt:wght@600&text=%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%A3%E0%B8%AD%E0%B8%81%E0%B8%95%E0%B8%B8%E0%B8%99%E0%B9%80%E0%B8%87%E0%B8%B4%E0%B8%99&display=swap';

/**
 * The same logo on every device whenever the app has to wait (owner, 2026-11-02: the waiting squirrel "ไม่เข้าทีม" ...
 * "เอาโลโก้ที่เป็นแอนิเมชันในมือถือเอามาใส่"): the phone's opening logo, drawn over the page, then hideSplash() lets it
 * finish its entrance and fade into the page. A caption under it says what is being waited for, when that is not
 * simply the app opening. Already on screen (the phone's opening logo): kept, so it never starts over.
 */
export function showSplash(options: { caption?: string; label?: string } = {}): void {
  if (typeof document === 'undefined') return;
  const current = document.getElementById('app-splash');
  // Still on screen, or on its way out: kept as it is (owner, 2026-11-14: the logo came up three times on opening).
  if (current) {
    if (current.dataset.leaving) {
      window.clearTimeout(pending);
      delete current.dataset.leaving;
      current.classList.remove('is-leaving');
    }
    setCaption(current, options.caption);
    return;
  }
  const dark = document.documentElement.classList.contains('dark');
  // Seen once already in this page (boot-skeleton.js or an earlier wait), or moments ago in this tab (LINE's page):
  // shown as its entrance ends, never again from the start.
  const settled = document.documentElement.dataset.splashSeen === '1' || Date.now() - lastShown() < RECENT_MS;
  document.documentElement.dataset.splashSeen = '1';
  markShown();
  const el = document.createElement('div');
  el.id = 'app-splash';
  el.className = `splash${dark ? ' dark' : ''}${settled ? ' is-settled has-name' : ''}`;
  if (settled) el.dataset.settled = '1';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', options.label || 'กำลังเปิดกระรอกตุนเงิน');
  el.dataset.shownAt = String(Date.now());
  el.innerHTML = '<div class="splash-stage" aria-hidden="true"><span class="splash-glow"></span><span class="splash-ring"></span><span class="splash-ring is-late"></span>'
    + `<svg class="splash-mark" viewBox="0 0 1000 1000"><path fill="#E65F2B" fill-rule="evenodd" d="${MARK}"/></svg></div>`
    + '<div class="splash-name" aria-hidden="true">กระรอก<em>ตุนเงิน</em></div>'
    + '<div class="splash-dots" aria-hidden="true"><i></i><i></i><i></i></div>';
  setCaption(el, options.caption);
  document.body.appendChild(el);
  if (!document.querySelector(`link[href="${NAME_FONT}"]`)) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = NAME_FONT;
    document.head.appendChild(font);
  }
  const name = () => el.classList.add('has-name');
  if (document.fonts?.load) document.fonts.load('600 24px Prompt', 'กระรอกตุนเงิน').then(name, name);
  window.setTimeout(name, 1400);
}

function setCaption(el: HTMLElement, caption?: string): void {
  el.querySelector('.splash-caption')?.remove();
  if (!caption) return;
  const line = document.createElement('p');
  line.className = 'splash-caption';
  line.textContent = caption;
  el.appendChild(line);
}

// The one timer of the logo on its way out, so a wait that starts again keeps it (showSplash).
let pending: number | undefined;

// When the logo was last on screen in this tab, shared with boot-skeleton.js and LINE's page (liff-add.js).
const SHOWN_KEY = 'krarok:splash';
const RECENT_MS = 20_000;
function lastShown(): number {
  try { return Number(sessionStorage.getItem(SHOWN_KEY)) || 0; } catch { return 0; }
}
function markShown(): void {
  try { sessionStorage.setItem(SHOWN_KEY, String(Date.now())); } catch { /* none */ }
}

export function hideSplash(): void {
  const el = typeof document === 'undefined' ? null : document.getElementById('app-splash');
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  const shownAt = Number(el.dataset.shownAt) || Date.now();
  const askedAt = Date.now();
  // A logo shown as it ends has no entrance to wait for: only long enough not to flicker.
  const minimum = el.dataset.settled ? SETTLED_MIN_MS : MIN_VISIBLE_MS;
  const leave = () => {
    el.classList.add('is-leaving');
    markShown();
    pending = window.setTimeout(() => el.remove(), LEAVE_MS);
  };
  const check = () => {
    if (!el.dataset.leaving) return;
    const entranceDone = Date.now() - shownAt >= minimum;
    const placeholders = document.querySelector('#root [aria-busy="true"]');
    if (entranceDone && (!placeholders || Date.now() - askedAt >= MAX_WAIT_MS)) leave();
    else pending = window.setTimeout(check, 80);
  };
  check();
}
