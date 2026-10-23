import React from 'react';
import { type MotionValue } from 'motion/react';
import { DOCS, SCREENS, VAULT, WHT } from './content';
import { SHOTS } from './shots.gen';
import { Fade, Layer, Pinned, Shot, centred, ramp, window4, type Keys, type Pose, type Size } from './stage';

// Chapter 4, on one stage, in three parts that hand over to each other:
//   1. three real documents of the same job, each a whole page the app produced: shown large one
//      at a time, then all three side by side;
//   2. what keeping received files is good for: real file rows from the vault, the real year
//      filter and the real download button;
//   3. which job still lacks its 50 ทวิ: the two real rows of the tracker.
// Issued documents and the vault are separate things in the app, so the three sheets leave before
// the vault files arrive: nothing is shown going from one into the other.

const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const PAPER = '0 30px 70px -28px rgba(60, 40, 20, 0.45), 0 0 0 1px rgba(60, 40, 20, 0.08)';
const LIFT = '0 22px 50px -24px rgba(60, 40, 20, 0.4), 0 0 0 1px rgba(60, 40, 20, 0.07)';
// Where each part starts and ends along the act.
const P = { docsEnd: 0.4, vaultIn: 0.45, vaultPick: 0.62, vaultEnd: 0.74, whtIn: 0.79 } as const;
const gone = (pose: Pose, dx = 0, dy = 0): Pose => ({ ...pose, x: pose.x + dx, y: pose.y + dy, o: 0 });

function layout({ w: W, h: H }: Size) {
  const wide = W >= 1024;
  const zone = wide ? { x: W * 0.685, y: H * 0.53 } : { x: W / 2, y: H * 0.68 };

  // 1. The three sheets: large in turn, then a row (wide) or a fanned stack (narrow).
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
      [enter + 0.085, focus], [enter + 0.135, slots[i]], [P.docsEnd, slots[i]], [P.docsEnd + 0.05, gone(slots[i], 0, -H * 0.14)],
    ];
    return { ...doc, keys, slot: slots[i], shown: [i === 0 ? -1 : enter + 0.03, enter + 0.1] as const };
  });
  const labelY = zone.y + (sheet.h * sRow) / 2 + 16;

  // 2. Files kept in the vault.
  const file = SHOTS[wide ? 'vault-file-wht' : 'nvault-file-wht'];
  const sFile = wide ? Math.min(0.72, (W * 0.54) / file.w) : Math.min(1, (W - 40) / file.w);
  const gap = wide ? 14 : 10;
  const top = zone.y - (file.h * sFile * 3 + gap * 2) / 2 + (wide ? 18 : 30);
  const from = [[-W * 0.3, -H * 0.1], [W * 0.3, 0], [0, H * 0.4]] as const;
  const files = VAULT.files.map((f, i) => {
    const rest: Pose = { x: zone.x - (file.w * sFile) / 2, y: top + i * (file.h * sFile + gap), s: sFile, o: 1 };
    const at = P.vaultIn + i * 0.035;
    const keys: Keys = [[at, gone(rest, from[i][0], from[i][1])], [at + 0.055, rest], [P.vaultEnd, rest], [P.vaultEnd + 0.045, gone(rest, 0, -H * 0.12)]];
    return { name: wide ? f.wide : f.narrow, keys };
  });
  const filter = SHOTS['vault-filter'], download = SHOTS['vault-download'];
  const sCtl = wide ? 1 : 0.92;
  const ctlY = top - 40 * sCtl - (wide ? 20 : 14);
  const right = zone.x + (file.w * sFile) / 2, left = zone.x - (file.w * sFile) / 2;
  const ctl = (x: number, delay: number): Keys => {
    const rest: Pose = { x, y: ctlY, s: sCtl, o: 1 };
    return [[P.vaultPick + delay, gone(rest, 0, 14)], [P.vaultPick + delay + 0.03, rest], [P.vaultEnd, rest], [P.vaultEnd + 0.04, gone(rest, 0, -H * 0.12)]];
  };
  const controls = { filter: ctl(right - filter.w * sCtl, 0), download: ctl(left, 0.03) };

  // 3. One job with its 50 ทวิ, one still waiting.
  const got = SHOTS[wide ? WHT.got.wide : WHT.got.narrow], waiting = SHOTS[wide ? WHT.waiting.wide : WHT.waiting.narrow];
  const sWht = wide ? Math.min(0.72, (W * 0.54) / got.w) : Math.min(0.92, (W - 40) / got.w, (H * 0.26) / got.h);
  const whtGap = wide ? 56 : 40;
  const whtTop = zone.y - (got.h * sWht + waiting.h * sWht + whtGap) / 2 + (wide ? 14 : 24);
  const gotAt: Pose = { x: zone.x - (got.w * sWht) / 2, y: whtTop, s: sWht, o: 1 };
  const waitingAt: Pose = { x: zone.x - (waiting.w * sWht) / 2, y: whtTop + got.h * sWht + whtGap, s: sWht, o: 1 };
  const wht = {
    got: { shot: wide ? WHT.got.wide : WHT.got.narrow, w: got.w, h: got.h, at: gotAt, keys: [[P.whtIn, gone(gotAt, 0, H * 0.3)], [P.whtIn + 0.05, gotAt], [1, gotAt]] as Keys },
    waiting: { shot: wide ? WHT.waiting.wide : WHT.waiting.narrow, w: waiting.w, h: waiting.h, at: waitingAt, keys: [[P.whtIn + 0.06, gone(waitingAt, 0, H * 0.3)], [P.whtIn + 0.11, waitingAt], [1, waitingAt]] as Keys },
  };
  return { wide, W, H, zone, sheet, sheets, labelY, sRow, file, files, filter, download, controls, ctlY, sCtl, wht };
}

function Heading({ en, th, plan, wide, H }: { en?: readonly string[]; th: readonly string[]; plan?: string; wide: boolean; H: number }) {
  return (
    <>
      {plan && <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{plan}</p>}
      {en && (
        <h2 className="mt-4 font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: wide ? Math.min(H * 0.07, 58) : 34, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {wide ? en.map(line => <span key={line} className="block whitespace-nowrap">{line}</span>) : en.join(' ')}
        </h2>
      )}
      <p className="font-semibold text-[#1C1917]" style={{ fontSize: en ? (wide ? Math.max(20, Math.min(H * 0.031, 27)) : 19) : wide ? Math.max(26, Math.min(H * 0.044, 38)) : 24, lineHeight: 1.4, marginTop: en ? (wide ? 16 : 8) : plan ? 14 : 0 }}>
        {th.map(line => <span key={line} className={wide || !en ? 'block' : 'inline'}>{line}{wide || !en ? '' : ' '}</span>)}
      </p>
    </>
  );
}

function Stage({ p, size }: { p: MotionValue<number>; size: Size }) {
  const L = React.useMemo(() => layout(size), [size]);
  const { wide, W, H } = L;
  const column: React.CSSProperties = wide ? { left: Math.max(40, W * 0.06), width: Math.min(W * 0.31, 430), top: '50%' } : { left: 20, width: W - 40, top: 84 };
  const centre = wide ? { transform: 'translateY(-50%)' } : undefined;
  const line = wide ? 18 : 15.5;
  const chip = 'inline-flex items-center rounded-full px-3 py-1 text-[13.5px] font-semibold';
  return (
    <>
      <div className="absolute inset-0 bg-[#FAF8F5]" />

      {L.sheets.map(doc => (
        <Layer key={doc.shot} p={p} keys={doc.keys} w={L.sheet.w} h={L.sheet.h} radius={3} shadow={PAPER} z={3} className="overflow-hidden bg-white"><Shot name={doc.shot} radius={0} /></Layer>
      ))}
      {/* Under the row: which document is which, and how its amount relates to the job. */}
      {wide && L.sheets.map(doc => (
        <Fade key={doc.shot} p={p} show={v => window4(v, 0.335, 0.365, P.docsEnd, P.docsEnd + 0.03)} shift={10} className="pointer-events-none absolute text-center"
          style={{ zIndex: 4, left: doc.slot.x, width: L.sheet.w * L.sRow, top: L.labelY }}>
          <p aria-hidden="true" className="text-[15px] font-semibold text-[#1C1917]">{doc.name}</p>
          <p aria-hidden="true" className="text-[14px] text-[#57514B]">{doc.says}</p>
        </Fade>
      ))}

      {L.files.map(f => (
        <Layer key={f.name} p={p} keys={f.keys} w={L.file.w} h={L.file.h} radius={16} shadow={LIFT} z={3} className="overflow-hidden bg-[#FAFAF9]"><Shot name={f.name} radius={0} /></Layer>
      ))}
      <Layer p={p} keys={L.controls.filter} w={L.filter.w} h={L.filter.h} radius={20} shadow={LIFT} z={4} className="overflow-hidden bg-white"><Shot name="vault-filter" radius={0} /></Layer>
      <Layer p={p} keys={L.controls.download} w={L.download.w} h={L.download.h} radius={20} shadow={LIFT} z={4} className="overflow-hidden bg-white"><Shot name="vault-download" radius={0} /></Layer>

      {(['got', 'waiting'] as const).map(key => (
        <React.Fragment key={key}>
          <Layer p={p} keys={L.wht[key].keys} w={L.wht[key].w} h={L.wht[key].h} radius={16} shadow={LIFT} z={3} className="overflow-hidden bg-white"><Shot name={L.wht[key].shot} radius={0} /></Layer>
          <Fade p={p} show={v => ramp(v, P.whtIn + (key === 'got' ? 0.04 : 0.1), P.whtIn + (key === 'got' ? 0.06 : 0.12))} shift={8} className="pointer-events-none absolute"
            style={{ zIndex: 4, left: L.wht[key].at.x, top: L.wht[key].at.y - (wide ? 38 : 32) }}>
            <span aria-hidden="true" className={`${chip} ${key === 'got' ? 'bg-[#1C1917] text-white' : 'bg-[#E65F2B] text-white'}`}>{WHT[key].label}</span>
          </Fade>
        </React.Fragment>
      ))}

      {/* Copy: one block per part, in the same place. */}
      <Fade p={p} show={v => 1 - ramp(v, P.docsEnd, P.docsEnd + 0.035)} shift={wide ? -20 : -12} axis={wide ? 'x' : 'y'} className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 10, ...column }}>
        <div style={centre}>
          <Heading en={DOCS.en} th={DOCS.th} plan={DOCS.plan} wide={wide} H={H} />
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

      <Fade p={p} show={v => window4(v, P.vaultIn, P.vaultIn + 0.035, P.vaultEnd, P.vaultEnd + 0.035)} shift={wide ? -20 : -12} axis={wide ? 'x' : 'y'} className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 10, ...column }}>
        <div style={centre}>
          <Heading en={VAULT.en} th={VAULT.th} plan={VAULT.plan} wide={wide} H={H} />
          <div className="relative" style={{ marginTop: wide ? 20 : 8, minHeight: wide ? 64 : 48 }}>
            <Fade p={p} show={v => 1 - ramp(v, P.vaultPick - 0.01, P.vaultPick + 0.01)} shift={8} className="absolute inset-x-0 top-0">
              <p className="text-[#3A342F] [text-wrap:pretty]" style={{ fontSize: line, lineHeight: 1.6 }}>{VAULT.support}</p>
            </Fade>
            <Fade p={p} show={v => ramp(v, P.vaultPick + 0.01, P.vaultPick + 0.03)} shift={8} className="absolute inset-x-0 top-0">
              <p className="text-[#3A342F] [text-wrap:pretty]" style={{ fontSize: line, lineHeight: 1.6 }}>{VAULT.pick}</p>
            </Fade>
          </div>
        </div>
      </Fade>

      <Fade p={p} show={v => ramp(v, P.whtIn, P.whtIn + 0.035)} shift={wide ? -20 : -12} axis={wide ? 'x' : 'y'} className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 10, ...column }}>
        <div style={centre}>
          <Heading th={WHT.th} wide={wide} H={H} />
          <p className={`text-[#57514B] [text-wrap:pretty] ${wide ? 'mt-5' : 'mt-2'}`} style={{ fontSize: wide ? 16 : 14.5, lineHeight: 1.65 }}>{WHT.note}</p>
        </div>
      </Fade>
    </>
  );
}

export function DocsAct() {
  return (
    <section id="documents" className="relative z-10 -mt-8 rounded-t-[32px] bg-[#FAF8F5]">
      <Pinned screens={SCREENS.docs} label="ออกเอกสารให้ลูกค้า เก็บเอกสารที่ได้รับ และติดตามใบ 50 ทวิ">
        {(p, size) => <Stage p={p} size={size} />}
      </Pinned>
      <div className="sr-only">
        {DOCS.sheets.map(doc => <p key={doc.shot}>{SHOTS[doc.shot].alt}</p>)}
        {VAULT.files.map(f => <p key={f.wide}>{SHOTS[f.wide].alt}</p>)}
        <p>{VAULT.pick}</p>
        <p>{SHOTS['wht-received'].alt} {SHOTS['wht-waiting'].alt}</p>
      </div>
    </section>
  );
}
