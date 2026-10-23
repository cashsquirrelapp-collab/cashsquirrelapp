import React from 'react';
import { AlertCircle, ArrowUpRight, BarChart3, Briefcase, CheckCircle2, FileText, Loader2, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import type { ChatCard, ConfirmCard, DocumentCard, ProjectCard, SummaryCard } from './assistantMock';
import { LineCard } from './LineCard';
import type { LineDueAction, LineItem } from './lineMock';

// Result cards inside an answer (brief §6): a project, a document, a money summary and a confirmation.
// In this phase they carry sample data and say so; the buttons open real pages of the app, and a
// confirmation never changes stored data.

export type ConfirmState = 'pending' | 'working' | 'done' | 'failed' | 'cancelled';

const SampleTag = () => <span className="asx-card-tag">{tr("ข้อมูลตัวอย่าง")}</span>;

function Head({ icon: Icon, title }: { icon: typeof Briefcase; title: string }) {
  return <div className="asx-rcard-head"><span className="asx-rcard-icon"><Icon size={16} strokeWidth={1.9} /></span><b>{title}</b><SampleTag /></div>;
}

function Rows({ rows }: { rows: { label: string; value: string; tone?: 'income' | 'expense' }[] }) {
  return (
    <dl className="asx-rcard-rows">
      {rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</dd></div>)}
    </dl>
  );
}

function Project({ card, onNavigate }: { card: ProjectCard; onNavigate: (path: string) => void }) {
  return (
    <div className="asx-rcard">
      <Head icon={Briefcase} title={tr("โปรเจกต์")} />
      <Rows rows={[{ label: tr("ชื่องาน"), value: card.name }, { label: tr("ลูกค้า"), value: card.client }, { label: tr("มูลค่างาน"), value: card.amount }, { label: tr("สถานะ"), value: card.status }]} />
      <div className="asx-rcard-actions"><button type="button" className="asx-pill-btn" onClick={() => onNavigate('/jobs')}>{tr("ตรวจสอบในหน้างาน")}<ArrowUpRight size={14} /></button></div>
    </div>
  );
}

function Document({ card, onNavigate }: { card: DocumentCard; onNavigate: (path: string) => void }) {
  return (
    <div className="asx-rcard">
      <Head icon={FileText} title={card.docType} />
      <Rows rows={[{ label: tr("เลขที่เอกสาร"), value: card.number }, { label: tr("ลูกค้า"), value: card.client }, { label: tr("ยอดเงิน"), value: card.amount }]} />
      <div className="asx-rcard-actions"><button type="button" className="asx-pill-btn" onClick={() => onNavigate(card.path)}>{tr("เปิดในแอป")}<ArrowUpRight size={14} /></button></div>
    </div>
  );
}

function Summary({ card }: { card: SummaryCard }) {
  return (
    <div className="asx-rcard">
      <Head icon={BarChart3} title={tr("สรุปการเงิน")} />
      <p className="asx-rcard-period">{card.period}</p>
      <Rows rows={[{ label: tr("รายรับ"), value: card.income, tone: 'income' }, { label: tr("รายจ่าย"), value: card.expense, tone: 'expense' }, { label: tr("เงินคงเหลือ"), value: card.balance }]} />
    </div>
  );
}

function Confirm({ card, state, onConfirm, onCancel }: { card: ConfirmCard; state: ConfirmState; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={`asx-rcard is-confirm is-${state}`}>
      <Head icon={CheckCircle2} title={card.title} />
      <Rows rows={card.changes} />
      {state === 'pending' || state === 'working' ? (
        <div className="asx-rcard-actions">
          <button type="button" className="asx-pill-btn" onClick={onCancel} disabled={state === 'working'}>{tr("ยกเลิก")}</button>
          <button type="button" className="asx-pill-btn is-primary" onClick={onConfirm} disabled={state === 'working'}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" />}{tr("ยืนยัน")}
          </button>
        </div>
      ) : (
        <p className={`asx-rcard-result is-${state}`} role="status">
          {state === 'done' && <><CheckCircle2 size={16} />{tr("ยืนยันแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง")}</>}
          {state === 'failed' && <><AlertCircle size={16} />{tr("ทำรายการไม่สำเร็จ")}<button type="button" className="asx-link-btn" onClick={onConfirm}>{tr("ลองอีกครั้ง")}</button></>}
          {state === 'cancelled' && <><X size={16} />{tr("ยกเลิกรายการนี้แล้ว")}</>}
        </p>
      )}
    </div>
  );
}

export function ChatCardView({ card, confirmState, onConfirm, onCancel, onNavigate, onLineDue }: {
  card: ChatCard; confirmState?: ConfirmState; onConfirm: (card: ConfirmCard) => void; onCancel: (card: ConfirmCard) => void; onNavigate: (path: string) => void;
  onLineDue?: (action: LineDueAction, item: LineItem) => void;
}) {
  switch (card.kind) {
    case 'project': return <Project card={card} onNavigate={onNavigate} />;
    case 'document': return <Document card={card} onNavigate={onNavigate} />;
    case 'summary': return <Summary card={card} />;
    case 'confirm': return <Confirm card={card} state={confirmState ?? 'pending'} onConfirm={() => onConfirm(card)} onCancel={() => onCancel(card)} />;
    case 'line': return <LineCard card={card.card} onDue={onLineDue} onOpen={onNavigate} />;
  }
}
