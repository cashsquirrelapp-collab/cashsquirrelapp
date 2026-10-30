import React from 'react';
import { Check, Download, FileArchive, FolderOpen } from 'lucide-react';
import { tr, T } from '../../../i18n/tr';
import './vault.css';

// คลังเอกสาร and ใบ 50 ทวิ on the landing (owner, 2026-10-31: "ไม่ต้องเอาหน้าจริงมา ทำเป็นไอคอน ... บิล ใบเสร็จ ใบ 50 ทวิ
// น่ารัก ๆ แล้วทำโมชั่นให้เห็นว่าเก็บไว้ในนี้ พอถึงสิ้นปีได้ไฟล์เดียว แตกออกเป็นไฟล์ zip ... แตกออกมาเป็นโปรเจกต์ต่าง ๆ
// ให้คุณไปยื่นภาษีได้เลย"). Three steps on a loop, drawn (not a screenshot):
//   1. slips, receipts, a 50 ทวิ and a contract drop into the vault, one by one, the count going up;
//   2. at the year's end the vault becomes one ZIP, and the download is pressed;
//   3. the ZIP opens into a folder per job, ready for the tax return.
// The loop runs only while it is on screen; with reduced motion it shows step 3, still. The step buttons jump.

type Act = 0 | 1 | 2;
/** How long each step stays (the four documents have landed by 4.9 s). */
const ACT_MS: Record<Act, number> = { 0: 5600, 1: 3800, 2: 6400 };
const STEPS: { label: string; line: string }[] = [
  { label: T('เก็บกับงาน'), line: T('ได้เอกสารเมื่อไร แนบเก็บไว้กับงานทันที') },
  { label: T('รวมเป็น ZIP'), line: T('สิ้นปี กดครั้งเดียว ได้ไฟล์ ZIP ไฟล์เดียว') },
  { label: T('แยกตามงาน'), line: T('แตกไฟล์ออกมา แยกโฟลเดอร์ตามงาน พร้อมยื่นภาษี') },
];
/** Where each document waits before it drops (px from the stage's centre line), and its tilt. */
const DOCS = [
  { kind: 'slip', x: -150, y: 18, r: -8 },
  { kind: 'wht', x: -50, y: 4, r: 5 },
  { kind: 'receipt', x: 50, y: 14, r: -4 },
  { kind: 'contract', x: 150, y: 2, r: 7 },
] as const;
const BEFORE = 8;
const FOLDERS = [
  { name: T('รีวิวสกินแคร์ · Brand A'), files: T('ใบ 50 ทวิ · สลิปโอน') },
  { name: T('ไลฟ์ขายของ · ร้าน Mint'), files: T('ใบ 50 ทวิ · สัญญา') },
  { name: T('ถ่ายภาพสินค้า · Brew Days'), files: T('สลิปโอน · ใบเสร็จ') },
  { name: T('รายจ่าย'), files: T('สลิปและใบเสร็จ 6 ไฟล์') },
];

function useReducedMotion() {
  const [still, setStill] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return still;
}

function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return seen;
}

/** The little papers: drawn with CSS, a few words each. */
function Paper({ kind }: { kind: typeof DOCS[number]['kind'] }) {
  if (kind === 'slip') return (
    <span className="gl-vdoc-paper is-slip">
      <i className="gl-vdoc-ok"><Check size={11} strokeWidth={3.2} /></i>
      <small>{tr('โอนสำเร็จ')}</small>
      <b className="gl-num">฿9,700</b>
    </span>
  );
  if (kind === 'wht') return (
    <span className="gl-vdoc-paper is-wht">
      <i className="gl-vdoc-stamp">{tr('50 ทวิ')}</i>
      <span className="gl-vdoc-lines"><i /><i /><i /></span>
    </span>
  );
  if (kind === 'receipt') return (
    <span className="gl-vdoc-paper is-receipt">
      <small>{tr('ใบเสร็จ')}</small>
      <span className="gl-vdoc-lines"><i /><i /></span>
      <b className="gl-num">฿1,250</b>
    </span>
  );
  return (
    <span className="gl-vdoc-paper is-contract">
      <small>{tr('สัญญา')}</small>
      <span className="gl-vdoc-lines"><i /><i /></span>
      <svg className="gl-vdoc-sign" viewBox="0 0 48 14" aria-hidden="true"><path d="M2 10c4-7 7-7 8-2s3 4 6-1 5-5 6 0 4 3 8-1 6-3 8 0 4 2 8-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </span>
  );
}

export function VaultStory() {
  const root = React.useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const seen = useOnScreen(root);
  const [act, setAct] = React.useState<Act>(() => (still ? 2 : 0));
  // A new round of step 1 replays the drops; a step pressed by hand stays a little longer.
  const [round, setRound] = React.useState(0);
  const [byHand, setByHand] = React.useState(false);
  const [landed, setLanded] = React.useState(0);

  React.useEffect(() => { if (still) setAct(2); }, [still]);
  React.useEffect(() => {
    if (still || !seen) return;
    const id = window.setTimeout(() => {
      setByHand(false);
      setAct(current => {
        const next = ((current + 1) % 3) as Act;
        if (next === 0) setRound(n => n + 1);
        return next;
      });
    }, ACT_MS[act] + (byHand ? 4000 : 0));
    return () => window.clearTimeout(id);
  }, [act, seen, still, byHand, round]);
  // The count goes up as each document lands in the vault (step 1 only).
  React.useEffect(() => {
    if (act !== 0 || still) { setLanded(DOCS.length); return; }
    setLanded(0);
    if (!seen) return;
    const ids = DOCS.map((_, at) => window.setTimeout(() => setLanded(at + 1), 1750 + at * 950));
    return () => ids.forEach(id => window.clearTimeout(id));
  }, [act, round, seen, still]);

  const jump = (next: Act) => {
    setByHand(true);
    if (next === 0) setRound(n => n + 1);
    setAct(next);
  };
  const count = BEFORE + landed;

  return (
    <div className="gl-vault-wrap">
      <div ref={root} className={`gl-demo gl-vault is-act-${act}${seen ? ' is-seen' : ''}`} role="img"
        aria-label={tr('ตัวอย่าง: สลิป ใบเสร็จ ใบ 50 ทวิ และสัญญา เก็บเข้าคลังเอกสาร สิ้นปีรวมเป็นไฟล์ ZIP เดียว แล้วแตกออกเป็นโฟลเดอร์ตามงาน พร้อมยื่นภาษี')}>
        <div className="gl-vault-head" aria-hidden="true">
          <span><b>{tr('คลังเอกสาร')}</b><small>{tr('ปี 2569')}</small></span>
          <span className="gl-vault-count"><FolderOpen size={15} strokeWidth={2.2} /><span className="gl-num" key={count}>{tr('{0} ไฟล์', count)}</span></span>
        </div>

        <div className="gl-vault-stage" aria-hidden="true">
          {/* 1 · the documents drop in, one by one */}
          <div className="gl-vault-docs" key={round}>
            {DOCS.map((doc, at) => (
              <span key={doc.kind} className="gl-vdoc" style={{ '--i': at, '--x': `${doc.x}px`, '--y': `${doc.y}px`, '--r': `${doc.r}deg` } as React.CSSProperties}>
                <span className="gl-vdoc-float"><Paper kind={doc.kind} /></span>
              </span>
            ))}
          </div>
          <div className="gl-vault-folder">
            <span className="gl-vfold-back" />
            <span className="gl-vfold-peek"><i /><i /></span>
            <span key={landed} className={`gl-vfold-front${landed ? ' is-gulp' : ''}`}><FolderOpen size={22} strokeWidth={2} />{tr('คลังเอกสาร')}</span>
          </div>

          {/* 2 · one ZIP for the year */}
          <div className="gl-vault-zip">
            <span className="gl-vzip-icon"><FileArchive size={26} strokeWidth={1.9} /><i className="gl-vzip-teeth" /></span>
            <span className="gl-vzip-text"><b>{tr('เอกสาร_2569.zip')}</b><small>{tr('12 ไฟล์ · แยกตามงาน')}</small></span>
            <span className="gl-vzip-dl"><Download size={15} strokeWidth={2.4} />{tr('ดาวน์โหลด')}<span className="gl-vzip-tap" /></span>
            <span className="gl-vzip-ready"><Check size={13} strokeWidth={3} />{tr('พร้อมยื่นภาษี')}</span>
          </div>

          {/* 3 · a folder per job */}
          <ul className="gl-vault-tree">
            {FOLDERS.map((folder, at) => (
              <li key={folder.name} style={{ '--i': at } as React.CSSProperties}>
                <span className="gl-vtree-icon"><FolderOpen size={17} strokeWidth={2} /></span>
                <span className="gl-vtree-main"><b>{tr(folder.name)}</b><small>{tr(folder.files)}</small></span>
              </li>
            ))}
          </ul>
        </div>

        <p className="gl-vault-line" aria-hidden="true">
          {STEPS.map((step, at) => <span key={step.label} className={act === at ? 'is-on' : ''}>{tr(step.line)}</span>)}
        </p>
      </div>
      <div className="gl-vault-steps" role="group" aria-label={tr('ขั้นตอนของคลังเอกสาร')}>
        {STEPS.map((step, at) => (
          <button key={step.label} type="button" aria-pressed={act === at} onClick={() => jump(at as Act)}>
            <i className="gl-num">{at + 1}</i>{tr(step.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
