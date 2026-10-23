import React from 'react';
import { ArrowDown } from 'lucide-react';
import { CTA, DOCS, DUE, HERO, LINE, VAULT, WHT } from './content';
import { LINE_DIGEST, LINE_UNPAID } from './line.gen';
import { LineCard } from './LineChat';
import { SHOTS, type ShotName } from './shots.gen';
import { StartButton } from './MoneyAct';

// Chapters 1 to 4 with nothing moving: the same words and the same real pictures, laid out in
// reading order. Shown when the visitor asks for reduced motion, and on screens too short to pin
// a stage on. Nothing is lost by not animating.

const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const wrap = 'mx-auto w-full max-w-[1120px] px-5 sm:px-8';
const pad = 'py-[clamp(4.5rem,3rem+6vw,8rem)]';
const en: React.CSSProperties = { fontFamily: EN_FONT, lineHeight: 1.04, letterSpacing: '-0.035em' };

/** A real screenshot: the full-window one on wide screens, the narrow-window one on small screens. */
function Pic({ wide, narrow, className = '', eager = false }: { wide: ShotName; narrow?: ShotName; className?: string; eager?: boolean }) {
  const a = SHOTS[wide], b = SHOTS[narrow ?? wide];
  return (
    <picture>
      {narrow && <source media="(min-width: 768px)" srcSet={a.file} width={Math.round(a.w)} height={Math.round(a.h)} />}
      <img src={b.file} alt={b.alt || a.alt} width={Math.round(b.w)} height={Math.round(b.h)} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className={`mx-auto block h-auto w-full rounded-[16px] border border-[#E7E0D8] bg-white shadow-[0_24px_60px_-34px_rgba(60,40,20,0.4)] ${className}`} style={{ maxWidth: Math.max(a.w, b.w) }} />
    </picture>
  );
}

const STEP_PICS: { wide: ShotName; narrow?: ShotName; more?: { wide: ShotName; narrow?: ShotName } }[] = [
  { wide: 'timeline', narrow: 'narrow-timeline' },
  { wide: 'job-before' },
  { wide: 'instalment' },
  { wide: 'job-after' },
  { wide: 'credit-30', narrow: 'ncredit-30', more: { wide: 'credit-45', narrow: 'ncredit-45' } },
];

export function StaticStory({ onStart }: { onStart: () => void }) {
  return (
    <>
      <section className={`${wrap} pb-[clamp(3rem,2rem+4vw,6rem)] pt-[clamp(6.5rem,5rem+5vw,10rem)] text-center`}>
        <h1 className="font-semibold text-[#1C1917]" style={{ ...en, fontSize: 'clamp(2.75rem, 1.2rem + 6.4vw, 6rem)' }}>{HERO.en.map(line => <span key={line} className="block">{line}</span>)}</h1>
        <p className="mt-5 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.3rem, 1.1rem + 0.9vw, 2rem)', lineHeight: 1.4 }}>
          <span className="block md:inline">{HERO.th[0]}</span>{' '}<span className="block md:inline">{HERO.th[1]}</span>
        </p>
        <p className="mx-auto mt-3 max-w-[36rem] text-[clamp(1rem,0.95rem+0.25vw,1.1rem)] leading-[1.7] text-[#57514B]">{HERO.support}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          <StartButton onClick={onStart} />
          <span className="inline-flex items-center gap-1.5 text-[14px] text-[#6B645D]"><ArrowDown className="h-4 w-4" aria-hidden="true" />{HERO.hint}</span>
        </div>
        <figure className="mt-[clamp(2.5rem,2rem+3vw,4.5rem)]">
          <Pic wide="timeline" narrow="narrow-timeline" eager />
          <figcaption className="mt-4 text-[15px] text-[#57514B]">{HERO.reveal}</figcaption>
        </figure>
      </section>

      <section id="due" className={`bg-white ${pad}`}>
        <div className={wrap}>
          <h2 className="font-semibold text-[#1C1917]" style={{ ...en, fontSize: 'clamp(2.2rem, 1.2rem + 4vw, 4.25rem)' }}>{DUE.en[0]}</h2>
          <p className="mt-4 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.7rem)', lineHeight: 1.45 }}>{DUE.th.map(line => <span key={line} className="block">{line}</span>)}</p>
          <ol className="mt-10 space-y-12">
            {DUE.steps.map((text, i) => (
              <li key={text} className="grid items-center gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10">
                <p className="text-[17px] leading-[1.65] text-[#3A342F]"><span className="mr-3 font-mono text-[#C24A16]">{String(i + 1).padStart(2, '0')}</span>{text}</p>
                <div className="space-y-3">
                  <Pic {...STEP_PICS[i]} />
                  {STEP_PICS[i].more && <Pic {...STEP_PICS[i].more!} />}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-[14.5px] leading-relaxed text-[#57514B]">{DUE.note}</p>
        </div>
      </section>

      <section id="line" className={`bg-[#1F1A16] text-[#FBF7F2] ${pad}`}>
        <div className={wrap}>
          <p className="inline-flex items-center rounded-full border border-[#E65F2B]/50 bg-[#E65F2B]/15 px-3 py-1 text-[13px] font-medium text-[#FFB48E]">{LINE.plan}</p>
          <h2 className="mt-4 font-semibold" style={{ ...en, fontSize: 'clamp(2.2rem, 1.2rem + 4vw, 4.25rem)' }}>{LINE.en.join(' ')}</h2>
          <p className="mt-4 font-semibold" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.7rem)', lineHeight: 1.45 }}>{LINE.th.join(' ')}</p>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {[{ says: LINE.check, message: LINE_UNPAID }, { says: LINE.notice, message: LINE_DIGEST }].map(item => (
              <figure key={item.says} className="flex flex-col items-center gap-4 md:items-start">
                <figcaption className="text-[17px] leading-[1.6] text-[#F3EBE3]">{item.says}</figcaption>
                <LineCard message={item.message} />
              </figure>
            ))}
          </div>
          <ul className="mt-8 space-y-1 text-[14px] leading-relaxed text-[#B8AEA4]">{LINE.notes.map(note => <li key={note}>{note}</li>)}</ul>
        </div>
      </section>

      <section id="documents" className={pad}>
        <div className={wrap}>
          <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{DOCS.plan}</p>
          <h2 className="mt-4 font-semibold text-[#1C1917]" style={{ ...en, fontSize: 'clamp(2.2rem, 1.2rem + 4vw, 4.25rem)' }}>{DOCS.en.join(' ')}</h2>
          <p className="mt-4 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.7rem)', lineHeight: 1.45 }}>{DOCS.th.join(' ')}</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {DOCS.sheets.map(doc => (
              <li key={doc.shot}>
                <Pic wide={doc.shot} className="rounded-[3px]" />
                <p className="mt-4 text-[17px] text-[#3A342F]"><span className="font-semibold text-[#1C1917]">{doc.name}</span> · {doc.says}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[15px] text-[#57514B]">{DOCS.note}</p>
        </div>
      </section>

      <section className={`bg-white ${pad}`}>
        <div className={`${wrap} grid gap-10 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-14`}>
          <div>
            <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{VAULT.plan}</p>
            <h2 className="mt-4 font-semibold text-[#1C1917]" style={{ ...en, fontSize: 'clamp(2.2rem, 1.2rem + 4vw, 4.25rem)' }}>{VAULT.en.join(' ')}</h2>
            <p className="mt-4 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.7rem)', lineHeight: 1.45 }}>{VAULT.th.join(' ')}</p>
            <p className="mt-3 text-[16.5px] leading-[1.7] text-[#57514B]">{VAULT.support}</p>
            <p className="mt-2 text-[16.5px] leading-[1.7] text-[#57514B]">{VAULT.pick}</p>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3"><Pic wide="vault-download" className="!w-auto rounded-full" /><Pic wide="vault-filter" className="!w-auto rounded-full" /></div>
            {VAULT.files.map(f => <Pic key={f.wide} wide={f.wide} narrow={f.narrow} />)}
          </div>
        </div>
      </section>

      <section className={pad}>
        <div className={wrap}>
          <h2 className="font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.8vw, 2.5rem)', lineHeight: 1.35 }}>{WHT.th.map(line => <span key={line} className="block">{line}</span>)}</h2>
          <div className="mt-8 space-y-6">
            {[WHT.got, WHT.waiting].map(row => (
              <figure key={row.label}>
                <figcaption className="mb-2 text-[16px] font-semibold text-[#1C1917]">{row.label}</figcaption>
                <Pic wide={row.wide} narrow={row.narrow} />
              </figure>
            ))}
          </div>
          <p className="mt-6 text-[15px] leading-relaxed text-[#57514B]">{WHT.note}</p>
        </div>
      </section>
    </>
  );
}

export { CTA };
