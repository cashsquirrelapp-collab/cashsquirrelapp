import React from 'react';
import { ArrowRight, Check, FileText, Sparkle, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { LineLogo } from '../../components/ui/LineLogo';
import { GmailLogo } from '../../components/ui/GmailLogo';
import { tr } from '../../i18n/tr';

// What Pro gives, as three small cards under the price (owner, 2026-10-29, design F after the "Matiz" reference): the
// card you press springs open and the other two fold into slim upright strips; ✕ or the same card closes it again.
// They stay smaller than the price card, which leads the page ("ไอ้งานรายละเอียดฟีเจอร์มึงไม่ต้องใหญ่ ... สิ่งที่อยากให้เด่นก็คือราคา").
// LINE has no card of its own any more: it sits with the reminders, and its hover note says you can chat with เลขา there.

type TileId = 'ai' | 'alerts' | 'docs';

function Tick({ tone }: { tone: TileId }) {
  return <span aria-hidden="true" className={`pf-tick is-${tone}`}><Check size={10} strokeWidth={3} /></span>;
}

export function ProFeatureTiles({ tokens }: { tokens: number }) {
  const [open, setOpen] = React.useState<TileId | null>(null);
  const flex = (id: TileId) => (open === null ? '1 1 0px' : open === id ? '7 1 0px' : '0 0 64px');
  const close = () => setOpen(null);
  const onKey = (event: React.KeyboardEvent) => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } };

  const tiles: { id: TileId; title: string; sub: string; orb: (d: number) => React.ReactNode; detail: React.ReactNode }[] = [
    {
      id: 'ai', title: tr('เลขากระรอก'), sub: tr('พิมพ์หรือพูด สั่งงานได้ทันที'),
      orb: d => <span className="pf-orb-ball is-ai" style={{ width: d, height: d }}><Mascot gear="headset" mood="happy" animated={false} size={Math.round(d * 0.66)} viewBox="12 8 76 76" /></span>,
      detail: <>
        <p className="pf-detail-head" data-testid="plan-ai-tokens"><b className="pf-num">{tokens.toLocaleString('en-US')}</b> {tr('โทเคนต่อเดือน')} · {tr('ใช้ร่วมกันในแอปและ LINE')}</p>
        <ul className="pf-detail-list">
          <li><Tick tone="ai" />{tr('จดงาน รายจ่าย และการรับเงิน ทีละหลายรายการได้')}</li>
          <li><Tick tone="ai" />{tr('ทำใบเสนอราคาและใบแจ้งหนี้ให้')}</li>
          <li><Tick tone="ai" />{tr('ตอบเรื่องเงินพร้อมกราฟ อ่านรูป สลิป และ PDF ให้')}</li>
        </ul>
      </>,
    },
    {
      id: 'alerts', title: tr('แจ้งเตือนอัตโนมัติ'), sub: tr('ทาง LINE และอีเมล ทุกเช้า'),
      orb: d => <span className="pf-orb-pill" style={{ width: Math.round(d * 1.44), height: d }}>
        <GmailLogo size={Math.round(d * 0.48)} className="pf-logo" />
        <span className="pf-tip"><LineLogo size={Math.round(d * 0.48)} className="pf-logo" /><span className="pf-tip-bubble" role="tooltip">{tr('แชตกับเลขาใน LINE ได้เหมือนในแอป สะดวกเวลาอยู่นอกบ้านหรือเดินทาง จดงานได้โดยไม่ต้องเปิดคอม')}</span></span>
      </span>,
      detail: <>
        <p className="pf-detail-head"><b className="pf-num">08:00</b> {tr('ทุกเช้า')} · {tr('ทาง LINE และอีเมล')}</p>
        <ul className="pf-detail-list">
          <li><Tick tone="alerts" />{tr('เตือนงานใกล้ครบกำหนด (ล่วงหน้า 1–2 วัน) ครบวันนี้ และเลยกำหนด')}</li>
          <li><Tick tone="alerts" />{tr('กด “ได้รับแล้ว” ใน LINE บันทึกรับเงินให้ทันที และสรุปรายเดือน')}</li>
        </ul>
        <p className="pf-line-note"><LineLogo size={22} /><span><b>{tr('แชตกับเลขาใน LINE ได้เหมือนในแอป')}</b> {tr('สะดวกเวลาอยู่นอกบ้าน จดงานได้โดยไม่ต้องเปิดคอม')}</span></p>
      </>,
    },
    {
      id: 'docs', title: tr('เอกสารไม่จำกัด'), sub: tr('และได้ใช้ฟีเจอร์ใหม่ก่อนใคร'),
      orb: d => <span className="pf-orb-ball is-docs" style={{ width: d, height: d }}>
        <FileText size={Math.round(d * 0.44)} strokeWidth={1.7} />
        <span className="pf-orb-spark"><Sparkle size={14} strokeWidth={2.2} /></span>
      </span>,
      detail: <>
        <p className="pf-detail-head"><b>{tr('เอกสารไม่จำกัด + ฟีเจอร์ใหม่ก่อนใคร')}</b> · {tr('แบบฟรีได้ 10 ฉบับ/เดือน')}</p>
        <ul className="pf-detail-list">
          <li><Tick tone="docs" />{tr('ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน ไม่จำกัดจำนวน')}</li>
          <li><Tick tone="docs" />{tr('ออกต่อจากใบเดิมได้ ไม่มีข้อความเครดิตของแอปบนเอกสาร')}</li>
          <li><span aria-hidden="true" className="pf-tick is-alerts"><Sparkle size={10} strokeWidth={2.6} /></span>{tr('ได้ใช้ฟีเจอร์ใหม่ก่อนใคร')}</li>
        </ul>
      </>,
    },
  ];

  return (
    <ul className="pf-tiles" aria-label={tr('สิ่งที่ได้ใน Pro')} onKeyDown={onKey}>
      {tiles.map(tile => {
        const state = open === null ? 'closed' : open === tile.id ? 'open' : 'folded';
        const detailId = `pf-detail-${tile.id}`;
        return (
          <li key={tile.id} className={`pf-tile is-${tile.id} is-${state}`} style={{ flex: flex(tile.id) }} data-feature={tile.id}>
            {state === 'closed' && (
              <button type="button" className="pf-tile-closed" onClick={() => setOpen(tile.id)} aria-expanded={false} aria-controls={detailId}>
                <span className="pf-tile-art" aria-hidden="true">{tile.orb(92)}</span>
                <span className="pf-tile-name">
                  <span className="pf-tile-text"><b>{tile.title}</b><span>{tile.sub}</span></span>
                  <span aria-hidden="true" className={`pf-go is-${tile.id}`}><ArrowRight size={12} strokeWidth={2.6} /></span>
                </span>
              </button>
            )}
            {state === 'open' && (
              <div className="pf-tile-open" id={detailId} role="region" aria-label={tile.title}>
                <div className="pf-open-art">
                  <span aria-hidden="true" className="pf-open-orb">{tile.orb(tile.id === 'alerts' ? 92 : 104)}</span>
                  <b>{tile.title}</b>
                </div>
                <div className="pf-open-card">
                  <button type="button" className="pf-close" onClick={close} aria-label={tr('ปิดรายละเอียด')}><X size={13} strokeWidth={2.2} /></button>
                  {tile.detail}
                </div>
              </div>
            )}
            {state === 'folded' && (
              <button type="button" className="pf-tile-folded" onClick={() => setOpen(tile.id)} aria-label={tr('เปิด {0}', tile.title)}>
                <span aria-hidden="true" className="pf-folded-art">{tile.id === 'alerts'
                  ? <span className="pf-folded-stack"><GmailLogo size={24} /><LineLogo size={24} /></span>
                  : tile.orb(40)}</span>
                <span className="pf-folded-name">{tile.title}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
