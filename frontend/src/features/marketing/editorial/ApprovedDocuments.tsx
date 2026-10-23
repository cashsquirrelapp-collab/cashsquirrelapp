import React from 'react';
import { useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { DOCS } from '../landing/story/content';
import { SHOTS } from '../landing/story/shots.gen';
import { Fade, Layer, Pinned, Shot, centred, ramp, window4, type Keys, type Pose, type Size } from '../landing/story/stage';
import { PUBLIC_PHASE_ONE } from './publicPhase';

// The approved document phase from DocsAct, using its original geometry, copy, assets and
// presentation. Only the clock's duration changes: this section stops at the three-sheet hold,
// before the source act moves on to the separately presented vault and 50 ทวิ sections.
const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const PAPER = '0 30px 70px -28px rgba(60, 40, 20, 0.45), 0 0 0 1px rgba(60, 40, 20, 0.08)';
const DOCS_END = 0.4;
const gone = (pose: Pose, dx = 0, dy = 0): Pose => ({ ...pose, x: pose.x + dx, y: pose.y + dy, o: 0 });

function layout({ w: W, h: H }: Size) {
  const wide = W >= 1024;
  const zone = wide ? { x: W * 0.685, y: H * 0.53 } : { x: W / 2, y: H * 0.68 };
  const sheet = SHOTS['doc-quotation'];
  const sFocus = wide ? Math.min((H * 0.84) / sheet.h, (W * 0.34) / sheet.w) : Math.min((W - 84) / sheet.w, (H * 0.56) / sheet.h);
  const sRow = wide ? Math.min((W * 0.18) / sheet.w, (H * 0.6) / sheet.h) : sFocus * 0.8;
  const step = wide ? sheet.w * sRow + 22 : 54;
  const focus = centred(zone.x, zone.y, sFocus, sheet.w, sheet.h);
  const slots = [-1, 0, 1].map(k => centred(zone.x + k * step, zone.y, sRow, sheet.w, sheet.h, 1, wide ? 0 : k * 4));
  const sheets = DOCS.sheets.map((doc, i) => {
    const enter = 0.02 + i * 0.1;
    const keys: Keys = [
      ...(i === 0 ? [[0, focus] as const] : [[enter, gone(focus, wide ? W * 0.12 : 0, H * 0.55)] as const, [enter + 0.05, focus] as const]),
      [enter + 0.085, focus], [enter + 0.135, slots[i]], [DOCS_END, slots[i]], [DOCS_END + 0.05, gone(slots[i], 0, -H * 0.14)],
    ];
    return { ...doc, keys, slot: slots[i], shown: [i === 0 ? -1 : enter + 0.03, enter + 0.1] as const };
  });
  const labelY = zone.y + (sheet.h * sRow) / 2 + 16;
  return { wide, W, H, sheet, sheets, labelY, sRow };
}

function Heading({ wide, H }: { wide: boolean; H: number }) {
  return (
    <>
      <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{DOCS.plan}</p>
      <h2 className="mt-4 font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: wide ? Math.min(H * 0.07, 58) : 34, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
        {wide ? DOCS.en.map(line => <span key={line} className="block whitespace-nowrap">{line}</span>) : DOCS.en.join(' ')}
      </h2>
      <p className="font-semibold text-[#1C1917]" style={{ fontSize: wide ? Math.max(20, Math.min(H * 0.031, 27)) : 19, lineHeight: 1.4, marginTop: wide ? 16 : 8 }}>
        {DOCS.th.map(line => <span key={line} className={wide ? 'block' : 'inline'}>{line}{wide ? '' : ' '}</span>)}
      </p>
    </>
  );
}

function DocumentStage({ progress, size }: { progress: MotionValue<number>; size: Size }) {
  const p = useTransform(progress, [0, 1], [0, 0.39]);
  const L = React.useMemo(() => layout(size), [size]);
  const { wide, W, H } = L;
  const column: React.CSSProperties = wide ? { left: Math.max(40, W * 0.06), width: Math.min(W * 0.31, 430), top: '50%' } : { left: 20, width: W - 40, top: 84 };
  const centre = wide ? { transform: 'translateY(-50%)' } : undefined;
  const line = wide ? 18 : 15.5;
  return (
    <>
      <div className="absolute inset-0 bg-[#FAF8F5]" />
      {L.sheets.map(doc => (
        <Layer key={doc.shot} p={p} keys={doc.keys} w={L.sheet.w} h={L.sheet.h} radius={3} shadow={PAPER} z={3} className="overflow-hidden bg-white"><Shot name={doc.shot} radius={0} /></Layer>
      ))}
      {wide && L.sheets.map(doc => (
        <Fade key={doc.shot} p={p} show={v => window4(v, 0.335, 0.365, DOCS_END, DOCS_END + 0.03)} shift={10} className="pointer-events-none absolute text-center"
          style={{ zIndex: 4, left: doc.slot.x, width: L.sheet.w * L.sRow, top: L.labelY }}>
          <p aria-hidden="true" className="text-[15px] font-semibold text-[#1C1917]">{doc.name}</p>
          <p aria-hidden="true" className="text-[14px] text-[#57514B]">{doc.says}</p>
        </Fade>
      ))}
      <Fade p={p} show={v => 1 - ramp(v, DOCS_END, DOCS_END + 0.035)} shift={wide ? -20 : -12} axis={wide ? 'x' : 'y'} className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 10, ...column }}>
        <div style={centre}>
          <Heading wide={wide} H={H} />
          <div className="relative" style={{ marginTop: wide ? 20 : 8, minHeight: wide ? 64 : 30 }}>
            {L.sheets.map((doc, i) => (
              <Fade key={doc.shot} p={p} show={v => (i === 0 ? 1 - ramp(v, doc.shown[1], doc.shown[1] + 0.02) : window4(v, doc.shown[0], doc.shown[0] + 0.02, doc.shown[1], doc.shown[1] + 0.02))} shift={8} className="absolute inset-x-0 top-0">
                <p className="text-[#3A342F]" style={{ fontSize: line, lineHeight: 1.6 }}><span className="font-semibold">{doc.name}</span> · {doc.says}</p>
              </Fade>
            ))}
            <Fade p={p} show={v => ramp(v, 0.34, 0.365)} shift={8} className="absolute inset-x-0 top-0">
              <p className="text-[#3A342F]" style={{ fontSize: line, lineHeight: 1.6 }}>{DOCS.note}</p>
            </Fade>
          </div>
        </div>
      </Fade>
    </>
  );
}

// Exact reduced-motion document composition from StaticStory. These are whole A4 documents,
// not desktop screenshots presented as mobile application screens.
function StaticDocuments() {
  const en: React.CSSProperties = { fontFamily: EN_FONT, lineHeight: 1.04, letterSpacing: '-0.035em' };
  return (
    <section id="documents" className="bg-[#FAF8F5] py-[clamp(4.5rem,3rem+6vw,8rem)]">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{DOCS.plan}</p>
        <h2 className="mt-4 font-semibold text-[#1C1917]" style={{ ...en, fontSize: 'clamp(2.2rem, 1.2rem + 4vw, 4.25rem)' }}>{DOCS.en.join(' ')}</h2>
        <p className="mt-4 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.7rem)', lineHeight: 1.45 }}>{DOCS.th.join(' ')}</p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {DOCS.sheets.map(doc => {
            const shot = SHOTS[doc.shot];
            return (
              <li key={doc.shot}>
                <picture>
                  <img src={shot.file} alt={shot.alt} width={Math.round(shot.w)} height={Math.round(shot.h)} loading="lazy" decoding="async"
                    className="mx-auto block h-auto w-full rounded-[3px] border border-[#E7E0D8] bg-white shadow-[0_24px_60px_-34px_rgba(60,40,20,0.4)]" style={{ maxWidth: shot.w }} />
                </picture>
                <p className="mt-4 text-[17px] text-[#3A342F]"><span className="font-semibold text-[#1C1917]">{doc.name}</span> · {doc.says}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-[15px] text-[#57514B]">{DOCS.note}</p>
      </div>
    </section>
  );
}

function FullDocuments() {
  const reduce = useReducedMotion();
  const [short, setShort] = React.useState(() => typeof window !== 'undefined' && window.innerHeight < 560);
  React.useEffect(() => {
    const read = () => setShort(window.innerHeight < 560);
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => { window.removeEventListener('resize', read); window.removeEventListener('orientationchange', read); };
  }, []);
  if (reduce || short) return <StaticDocuments />;
  return (
    <section id="documents" className="relative z-10 -mt-8 rounded-t-[32px] bg-[#FAF8F5]">
      <Pinned screens={3} label="ออกเอกสารให้ลูกค้า">
        {(p, size) => <DocumentStage progress={p} size={size} />}
      </Pinned>
      <div className="sr-only">{DOCS.sheets.map(doc => <p key={doc.shot}>{SHOTS[doc.shot].alt}</p>)}</div>
    </section>
  );
}

function PhaseOneDocuments() {
  const examples = [
    { shot: 'doc-invoice', name: 'ใบแจ้งหนี้', description: 'แจ้งรายละเอียดและยอดที่เรียกเก็บให้ลูกค้า' },
    { shot: 'doc-receipt', name: 'ใบเสร็จรับเงิน', description: 'ยืนยันยอดเงินที่ได้รับจากลูกค้า' },
  ] as const;
  return <section id="documents" className="phase-one-documents">
    <div className="editorial-wrap">
      <div className="phase-one-documents-heading">
        <p className="eyebrow">เอกสารสำหรับงานของคุณ</p>
        <h2>งานพร้อมส่ง<br /><span className="soft-text">เอกสารก็พร้อมด้วย</span></h2>
        <p>ใบแจ้งหนี้ ใบเสร็จรับเงิน และใบกำกับภาษี<br />เลือกให้ตรงกับเอกสารที่ต้องใช้</p>
      </div>
      <div className="phase-one-document-types" aria-label="ประเภทเอกสารที่เปิดใช้งาน">
        <span>ใบแจ้งหนี้</span><span>ใบเสร็จรับเงิน</span><span>ใบกำกับภาษี</span>
      </div>
      <div className="phase-one-document-examples">
        {examples.map(example => {
          const shot = SHOTS[example.shot];
          return <figure key={example.shot}>
            <img src={shot.file} alt={shot.alt} width={Math.round(shot.w)} height={Math.round(shot.h)} loading="lazy" decoding="async" />
            <figcaption><strong>{example.name}</strong><span>{example.description}</span></figcaption>
          </figure>;
        })}
      </div>
      <p className="phase-one-document-source">ตัวอย่างใบแจ้งหนี้และใบเสร็จจากแอปจริง · ข้อมูลตัวอย่าง</p>
      <p className="phase-one-document-access">Free สร้างเอกสารใหม่ได้ 10 ใบต่อเดือน พร้อม PDF ที่มีเครดิตกระรอกตุนเงิน<br />Pro สร้างได้ไม่จำกัด พร้อม PDF ที่ไม่มีลายน้ำเครดิต</p>
    </div>
  </section>;
}

export default function ApprovedDocuments() {
  return PUBLIC_PHASE_ONE ? <PhaseOneDocuments /> : <FullDocuments />;
}
