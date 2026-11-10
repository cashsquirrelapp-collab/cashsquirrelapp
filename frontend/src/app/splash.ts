// The logo the app shows while it opens (phones, owner 2026-10-22) and whenever it has to wait (every device, 2026-11-02).
// Look A (owner, 2026-11-11, after the Dime clip: "อยากได้แบบนั้น", "เอาแบบ A ไม่รอข้อมูล"):
// 1. A small mark breathes in the middle: boot-skeleton.js draws it before the app's code arrives, showSplash() when
//    the app has to wait later.
// 2. playSplash() runs as soon as the code is here (main.tsx), without waiting for the account's data: the mark folds
//    away, an orange arc sweeps round a tilted ring, the letters swing round it into place and a dot drops and swells
//    into the mark.
// 3. hideSplash() hands over once the page under it is ready and the logo has assembled: the page shows through, then
//    the logo goes. Still waiting long after it assembled: three dots show under it.
const MIN_WAIT_MS = 350;
const FONT_WAIT_MS = 1200;
export const ASSEMBLED_MS = 1150;
const STATIC_MIN_MS = 1100;
const LONG_WAIT_MS = 1900;
const MAX_WAIT_MS = 2500;
const GIVE_UP_MS = 4000;
const LEAVE_MS = 600;

// The logo mark, the same drawing boot-skeleton.js uses (public/kv/symbol.svg).
const MARK = 'M462.2891 71.133 C634.9705 58.7986 816.0986 143.1701 886.4971 307.4335 C897.3079 332.6583 907.1436 358.7126 912.5548 385.7689 C920.9325 427.6565 923.5996 472.9793 918.867 515.5722 C905.5484 635.4416 835.3596 739.1615 746.659 816.7746 C668.3074 885.3322 565.9157 929.422 461.1561 929.422 C418.5151 929.422 358.5401 922.7653 350.4509 870.185 C349.3618 863.1059 350.0229 855.8166 351.422 848.8208 C361.2645 799.6082 414.5101 798.9129 453.8728 791.0405 C474.4152 786.932 494.9066 778.0173 512.9479 767.5722 C591.6984 721.9798 619.9668 620.2117 584.9711 538.5549 C565.5644 493.2728 518.8689 458.1077 474.2659 440.474 C407.4458 414.0567 327.7454 408.613 262.0809 441.4451 C228.6948 458.1383 197.2659 488.8157 205.4336 529.6531 C212.2983 563.9768 251.1019 578.0934 280.6937 585.4912 C296.1002 589.3431 311.9956 590.6752 327.792 591.8034 C338.9737 592.6021 350.4064 591.9653 361.6185 591.9653 C414.9505 591.9653 497.7971 591.2465 514.4045 657.6764 C516.8075 667.2878 518.5276 675.9879 518.1272 685.9999 C517.8095 693.9399 515.3149 701.5834 512.6243 708.9827 C494.0358 760.101 438.9823 761.9075 393.1792 761.9075 C375.1886 761.9075 353.6752 764.9772 336.6936 757.6995 C312.0255 747.1274 308.624 709.7501 329.7342 693.607 C341.905 684.2998 356.6295 684.2197 371.3295 684.2197 C386.7051 684.2197 402.081 684.2197 417.4566 684.2197 C429.6845 684.2197 446.2587 685.7037 455.977 676.6128 C473.0076 660.6807 453.9532 640.108 438.1733 634.37 C419.1027 627.4352 398.5829 628.3815 378.6127 628.3815 C357.4386 628.3815 336.6086 627.4621 315.4913 625.9538 C288.8679 624.0521 262.3965 620.1388 236.8324 612.3584 C167.6326 591.2977 109.5945 536.6032 88.4163 467.0173 C82.513 447.621 80 427.7057 80 407.4566 C80 276.3183 181.9107 173.2064 292.8325 117.7457 C316.3862 105.9688 340.4711 96.2803 365.6648 88.6128 C396.8589 79.1189 429.8085 73.453 462.2891 71.133 Z';
const NAME_FONT = 'https://fonts.googleapis.com/css2?family=Prompt:wght@600&text=%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%A3%E0%B8%AD%E0%B8%81%E0%B8%95%E0%B8%B8%E0%B8%99%E0%B9%80%E0%B8%87%E0%B8%B4%E0%B8%99&display=swap';
// กระรอกตุนเงิน in letter groups, so the marks above and below stay with their letter; ตุนเงิน in orange.
export const NAME_PARTS = ['ก', 'ร', 'ะ', 'ร', 'อ', 'ก', 'ตุ', 'น', 'เ', 'งิ', 'น'];
const ORANGE_FROM = 6;

const markSvg = (cls: string) => `<svg class="${cls}" viewBox="0 0 1000 1000"><path fill="#E65F2B" fill-rule="evenodd" d="${MARK}"/></svg>`;
/** The waiting screen; boot-skeleton.js writes the same markup. */
const WAIT_HTML = '<span class="splash-bg"></span><div class="splash-body"><div class="splash-stage" aria-hidden="true">'
  + `${markSvg('splash-wait')}</div><div class="splash-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
/** The ring, the mark's place with its dot, and the name, added when the logo assembles. */
const LOCK_HTML = '<div class="splash-orbit"><svg class="splash-arc" viewBox="-100 -100 200 200"><circle r="80" pathLength="100"/></svg></div>'
  + `<div class="splash-lock"><span class="splash-slot">${markSvg('splash-mark')}<i class="splash-dot"></i></span>`
  + `<span class="splash-name">${NAME_PARTS.map((part, i) => `<span${i >= ORANGE_FROM ? ' class="is-orange"' : ''}>${part}</span>`).join('')}</span></div>`;

/**
 * Draw the logo over the page while the app waits (owner, 2026-11-02: the waiting squirrel "ไม่เข้าทีม" ... "เอาโลโก้ที่เป็น
 * แอนิเมชันในมือถือเอามาใส่"); hideSplash() fades it into the page. A caption under it says what is being waited for,
 * when that is not simply the app opening. Already on screen (the phone's opening logo): kept, so it never starts over.
 */
export function showSplash(options: { caption?: string; label?: string } = {}): void {
  if (typeof document === 'undefined') return;
  const current = document.getElementById('app-splash');
  if (current && !current.dataset.leaving) { setCaption(current, options.caption); return; }
  current?.remove();
  const dark = document.documentElement.classList.contains('dark');
  const el = document.createElement('div');
  el.id = 'app-splash';
  el.className = `splash${dark ? ' dark' : ''}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', options.label || 'กำลังเปิดกระรอกตุนเงิน');
  el.dataset.shownAt = String(Date.now());
  el.innerHTML = WAIT_HTML;
  setCaption(el, options.caption);
  document.body.appendChild(el);
  playSplash();
}

function setCaption(el: HTMLElement, caption?: string): void {
  el.querySelector('.splash-caption')?.remove();
  if (!caption) return;
  const line = document.createElement('p');
  line.className = 'splash-caption';
  line.textContent = caption;
  (el.querySelector('.splash-body') ?? el).appendChild(line);
}

/** The app's code is here: assemble the logo on screen, once. Reduced motion: the logo simply shows. */
export function playSplash(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('app-splash');
  const stage = el?.querySelector<HTMLElement>('.splash-stage');
  if (!el || !stage || el.dataset.played) return;
  el.dataset.played = '1';
  stage.insertAdjacentHTML('beforeend', LOCK_HTML);
  const shownAt = Number(el.dataset.shownAt) || Date.now();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof stage.animate !== 'function') {
    el.classList.add('is-static');
    // Long enough not to flicker: counts as assembled at most STATIC_MIN_MS after it first showed.
    el.dataset.morphAt = String(Math.max(shownAt + STATIC_MIN_MS, Date.now() + 300) - ASSEMBLED_MS);
    return;
  }
  void nameFont().then(() => {
    window.setTimeout(() => {
      if (el.isConnected && !el.classList.contains('is-leaving')) assemble(el, stage);
    }, Math.max(0, shownAt + MIN_WAIT_MS - Date.now()));
  });
}

/** The name's typeface, so the letters land where the finished name has them; at most FONT_WAIT_MS. */
function nameFont(): Promise<void> {
  let link = document.querySelector<HTMLLinkElement>(`link[href="${NAME_FONT}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = NAME_FONT;
    document.head.appendChild(link);
  }
  const sheet = link.sheet ? Promise.resolve() : new Promise<void>(resolve => {
    link!.addEventListener('load', () => resolve(), { once: true });
    link!.addEventListener('error', () => resolve(), { once: true });
  });
  const face = sheet.then(() => document.fonts?.load('600 30px Prompt', 'กระรอกตุนเงิน')).then(() => undefined, () => undefined);
  return Promise.race([face, new Promise<void>(resolve => window.setTimeout(resolve, FONT_WAIT_MS))]);
}

function assemble(el: HTMLElement, stage: HTMLElement): void {
  el.dataset.morphAt = String(Date.now());
  window.setTimeout(() => { if (!el.classList.contains('is-leaving')) el.classList.add('is-long'); }, LONG_WAIT_MS);
  const play = (node: Element | null, frames: Keyframe[], at: number, duration: number, easing: string, fill: FillMode = 'forwards') =>
    node?.animate(frames, { delay: at, duration, easing, fill });
  const q = (selector: string) => stage.querySelector(selector);

  // The breathing mark folds away.
  play(q('.splash-wait'), [{ transform: 'scale(1) rotate(0deg)', opacity: 1 }, { transform: 'scale(.1) rotate(-150deg)', opacity: 0 }], 0, 280, 'cubic-bezier(.55,0,.75,.2)');
  // An orange arc sweeps round a tilted ring.
  const sweep = 'cubic-bezier(.3,.55,.35,1)';
  play(q('.splash-arc'), [{ opacity: 0, transform: 'rotateX(62deg) rotateZ(-70deg)' }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .7 }, { opacity: 0, transform: 'rotateX(62deg) rotateZ(320deg)' }], 40, 920, sweep, 'both');
  play(q('.splash-arc circle'), [{ strokeDasharray: '0 100' }, { strokeDasharray: '40 60', offset: .45 }, { strokeDasharray: '3 97' }], 40, 920, sweep, 'both');
  // The letters swing round the same ring, flipping, and land in their place one after another.
  const box = stage.getBoundingClientRect();
  const cx = box.width / 2, cy = box.height / 2;
  const ringX = (a: number) => cx + 84 * Math.cos(a), ringY = (a: number) => cy + 38 * Math.sin(a);
  const tilt = [-50, 40, -30, 60, -45, 35, -55, 30, -40, 50, -35];
  stage.querySelectorAll('.splash-name span').forEach((letter, i) => {
    const r = letter.getBoundingClientRect();
    const x = r.left - box.left + r.width / 2, y = r.top - box.top + r.height / 2;
    const end = Math.acos(Math.max(-1, Math.min(1, (x - cx) / 84)));
    const at = (f: number) => end - 2.4 * (1 - f);
    const move = (f: number, turn: number, z: number, size: number) =>
      `translate(${(ringX(at(f)) - x).toFixed(1)}px,${(ringY(at(f)) - y).toFixed(1)}px) rotateY(${turn}deg) rotateZ(${z.toFixed(1)}deg) scale(${size})`;
    const z = tilt[i % tilt.length];
    play(letter, [
      { transform: move(0, 180, z, .7), opacity: 0, filter: 'blur(3px)', easing: 'cubic-bezier(.4,0,1,1)' },
      { transform: move(.34, 135, z * .75, .8), opacity: 1, filter: 'blur(2.5px)', offset: .2, easing: 'linear' },
      { transform: move(.67, 90, z * .5, .9), filter: 'blur(2px)', offset: .38, easing: 'linear' },
      { transform: move(1, 45, z * .25, .95), filter: 'blur(1px)', offset: .56, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: 'translate(0px,0px) rotateY(0deg) rotateZ(0deg) scale(1)', opacity: 1, filter: 'blur(0px)' },
    ], 150 + i * 30, 680, 'linear', 'both');
  });
  // A dot drops in, squashes, and swells into the mark.
  const dot = q('.splash-dot');
  play(dot, [{ transform: 'translateY(-190px) scale(.5)', opacity: 0 }, { opacity: 1, offset: .25 }, { transform: 'translateY(0px) scale(1)', opacity: 1 }], 560, 300, 'cubic-bezier(.5,0,.85,.35)', 'both');
  play(dot, [{ transform: 'translateY(0px) scale(1.35,.65)' }, { transform: 'translateY(0px) scale(1,1)' }], 860, 110, 'ease-out');
  play(dot, [{ transform: 'translateY(0px) scale(1)', opacity: 1 }, { transform: 'translateY(0px) scale(3.4)', opacity: 0 }], 930, 260, 'cubic-bezier(.2,.8,.2,1)');
  play(q('.splash-mark'), [{ transform: 'scale(.2) rotate(-30deg)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: 'scale(1.12) rotate(5deg)', offset: .6 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], 900, 440, 'cubic-bezier(.25,.8,.3,1)', 'both');
}

/**
 * When the logo may hand over to the page: it has assembled, and the page's own loading placeholders (aria-busy) have
 * gone or it has waited MAX_WAIT_MS for them. GIVE_UP_MS after the app asked, it goes regardless.
 */
export function readyToLeave(input: { morphAt: number; askedAt: number; now: number; placeholders: boolean }): boolean {
  const { morphAt, askedAt, now, placeholders } = input;
  if (now - askedAt >= GIVE_UP_MS) return true;
  if (!morphAt || now - morphAt < ASSEMBLED_MS) return false;
  return !placeholders || now - askedAt >= MAX_WAIT_MS;
}

export function hideSplash(): void {
  const el = typeof document === 'undefined' ? null : document.getElementById('app-splash');
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  const askedAt = Date.now();
  const check = () => {
    const placeholders = !!document.querySelector('#root [aria-busy="true"]');
    if (readyToLeave({ morphAt: Number(el.dataset.morphAt) || 0, askedAt, now: Date.now(), placeholders })) {
      el.classList.add('is-leaving');
      window.setTimeout(() => el.remove(), LEAVE_MS);
    } else window.setTimeout(check, 80);
  };
  check();
}
