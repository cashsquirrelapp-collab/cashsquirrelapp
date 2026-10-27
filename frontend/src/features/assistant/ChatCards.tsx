import React from 'react';
import { AlertCircle, ArrowUpRight, BarChart3, Briefcase, Check, CheckCircle2, ChevronRight, FileText, Landmark, ListChecks, Loader2, Pencil, Send, UserRound, X } from 'lucide-react';
import { saveAccountName } from './accountName';
import { tr, T } from '../../i18n/tr';
import { partyAnswer, paymentAnswer, thaiDateAnswer, type AskQuestion, type PartyValues } from '../../../../shared/askQuestions';
import type { ChatCard, ConfirmCard, DocumentCard, EditField, MoneyChartCard, OfficialLinkCard, ProjectCard, QuestionsCard, RenameCard, SummaryCard } from './assistantMock';
import { formatTHB } from '../../../../shared/thb';
import { isValidWhtRate } from '../../../../shared/wht';
import { dateLocale } from '../../utils';
import { LineCard } from './LineCard';
import type { LineDueAction, LineItem } from './lineMock';

// Result cards inside an answer (brief §6): a project, a document, a money summary and a confirmation.
// With the sample transport they carry sample data and say so, and a confirmation changes nothing. With the
// live transport they show the account's own data, and ยืนยัน saves the change through the backend.

export type ConfirmState = 'pending' | 'working' | 'done' | 'failed' | 'cancelled' | 'expired';

const SampleTag = () => <span className="asx-card-tag">{tr("ข้อมูลตัวอย่าง")}</span>;

// Real answers (the live transport) carry the account's own data, so they lose the sample tag.
const LiveContext = React.createContext(false);

/** A card's state, top right, the same words on every card (DESIGN.md §4). */
type CardState = { tone: 'wait' | 'busy' | 'done' | 'failed' | 'muted'; text: string };
function Head({ icon: Icon, title, state }: { icon: typeof Briefcase; title: string; state?: CardState }) {
  const live = React.useContext(LiveContext);
  return (
    <div className="asx-rcard-head">
      <span className="asx-rcard-icon"><Icon size={16} strokeWidth={1.9} /></span><b>{title}</b>{!live && <SampleTag />}
      {state && <span className={`asx-card-state is-${state.tone}`}>{state.tone === 'busy' ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <i aria-hidden="true" />}{state.text}</span>}
    </div>
  );
}

/** An amount with its baht sign set a hair apart from the figure (owner, 2026-10-27: "ติดสัญลักษณ์ของบาทเกินไป อาจจะต้อง
 *  เว้นสเปซนิดนึง"). The text stays exactly as given ("฿9,650"), so copying and screen readers read it as before; a sign
 *  that already has a space after it is left alone. Anything that is not an amount passes through. */
export function Money({ value }: { value: string }) {
  const sign = /^([−-]?)฿/.exec(value);
  const rest = sign ? value.slice(sign[0].length) : '';
  if (!sign || !/^\s?\d/.test(rest)) return <>{value}</>;
  return <>{sign[1]}<span className={`asx-baht${/^\s/.test(rest) ? '' : ' is-tight'}`}>฿</span>{rest}</>;
}

function Rows({ rows }: { rows: { label: string; value: string; tone?: 'income' | 'expense' }[] }) {
  return (
    <dl className="asx-rcard-rows">
      {rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd className={row.tone ? `is-${row.tone}` : undefined}><Money value={row.value} /></dd></div>)}
    </dl>
  );
}

function Project({ card, onNavigate }: { card: ProjectCard; onNavigate: (path: string) => void }) {
  return (
    <div className="asx-rcard is-project">
      <button type="button" className="asx-card-open" onClick={() => onNavigate('/jobs')} aria-label={tr("ตรวจสอบในหน้างาน")}>
        <Head icon={Briefcase} title={tr("โปรเจกต์")} /><ArrowUpRight size={16} aria-hidden="true" />
      </button>
      <div className="asx-card-preview">
        <span className="asx-card-eyebrow">{tr("มูลค่างาน")}</span><strong className="asx-card-amount"><Money value={card.amount} /></strong>
        <p className="asx-card-subtitle">{card.name}</p>
      </div>
      <Rows rows={[{ label: tr("ลูกค้า"), value: card.client }, { label: tr("สถานะงาน"), value: card.status }]} />
    </div>
  );
}

function Document({ card, onNavigate }: { card: DocumentCard; onNavigate: (path: string) => void }) {
  return (
    <div className="asx-rcard is-document">
      <button type="button" className="asx-card-open" onClick={() => onNavigate(card.path)} aria-label={`${tr("เปิดในแอป")} · ${card.number}`}>
        <Head icon={FileText} title={card.docType} /><ArrowUpRight size={16} aria-hidden="true" />
      </button>
      <div className="asx-card-preview">
        <span className="asx-card-eyebrow">{tr("ยอดเงิน")}</span><strong className="asx-card-amount"><Money value={card.amount} /></strong>
        <p className="asx-card-subtitle">{card.number}</p>
      </div>
      <Rows rows={[{ label: tr("ลูกค้า"), value: card.client }]} />
    </div>
  );
}

// Official websites only (the server picks them from a fixed list; the address is checked again here before it becomes
// a link). They open in a new tab: the Revenue Department's site cannot be embedded, and passwords and OTPs are typed
// there, never in the chat (brief "ACCOUNTING BRAIN & TAX NAVIGATOR", 2026-10-26).
const OFFICIAL_HOSTS = ['www.rd.go.th', 'rd.go.th', 'efiling.rd.go.th', 'www.dbd.go.th', 'dbd.go.th', 'tfac.or.th', 'www.tfac.or.th'];
export function officialHref(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && OFFICIAL_HOSTS.includes(parsed.hostname) ? parsed : null;
  } catch { return null; }
}

function OfficialLink({ card }: { card: OfficialLinkCard }) {
  const href = officialHref(card.url);
  const head = <div className="asx-rcard-head"><span className="asx-rcard-icon"><Landmark size={16} strokeWidth={1.9} /></span><b>{card.title}</b></div>;
  return (
    <div className="asx-rcard is-official">
      {href ? (
        <a className="asx-card-open" href={href.href} target="_blank" rel="noopener noreferrer" aria-label={`${tr("เปิดเว็บไซต์")} · ${card.title}`}>
          {head}<ArrowUpRight size={16} aria-hidden="true" />
        </a>
      ) : head}
      <div className="asx-card-preview">
        <p className="asx-card-eyebrow">{card.org}{href ? ` · ${href.hostname}` : ''}</p>
        <p className="asx-card-subtitle">{card.description}</p>
        <p className="asx-card-eyebrow">{tr("ทำในเว็บนี้")}: {card.todo}</p>
      </div>
    </div>
  );
}

function Summary({ card }: { card: SummaryCard }) {
  return (
    <div className="asx-rcard is-summary">
      <Head icon={BarChart3} title={tr("สรุปการเงิน")} />
      <p className="asx-rcard-period">{card.period}</p>
      <MoneyOverview balance={card.balance} income={card.income} expense={card.expense} />
    </div>
  );
}

/** Display the server's amounts verbatim; totals are never recomputed by the card. */
function MoneyOverview({ balance, income, expense, totals = false }: { balance: string; income: string; expense: string; totals?: boolean }) {
  return <>
    <div className="asx-card-preview"><span className="asx-card-eyebrow">{tr("เงินคงเหลือ")}</span><strong className="asx-card-amount"><Money value={balance} /></strong></div>
    <dl className="asx-rcard-rows asx-card-metrics">
      <div><dt>{totals ? tr("รายรับรวม") : tr("รายรับ")}</dt><dd className="is-income"><Money value={income} /></dd></div>
      <div><dt>{totals ? tr("รายจ่ายรวม") : tr("รายจ่าย")}</dt><dd className="is-expense"><Money value={expense} /></dd></div>
    </dl>
  </>;
}

/** A compact view is only used for known create forms. Other actions keep every change visible. */
function ConfirmPreview({ card, onEditParty }: { card: ConfirmCard; onEditParty?: (group: string) => void }) {
  const isDocument = card.changes.some(row => row.label === 'เอกสาร') && card.changes.some(row => row.label === 'ยอดชำระสุทธิ');
  const isNewProject = card.title === 'เพิ่มงานใหม่ 1 งาน' || card.title === tr("เพิ่มงานใหม่ 1 งาน");
  if (!isDocument && !isNewProject) return <Rows rows={card.changes} />;
  const amount = card.changes.find(row => isDocument ? row.label === 'ยอดชำระสุทธิ' : ['มูลค่า', 'มูลค่างาน', 'ค่าจ้าง', tr("ค่าจ้าง")].includes(row.label));
  const subject = isNewProject ? card.changes.find(row => ['งาน', tr("งาน")].includes(row.label)) : undefined;
  const parties = isDocument && card.edit?.some(field => field.field === 'issuer_name');
  const preferred = isDocument ? [...(parties ? [] : ['ผู้ออก / ลูกค้า']), 'รายการ 1', 'กำหนดชำระ'] : ['ลูกค้า', 'สถานะงาน', 'การชำระ', tr("ลูกค้า")];
  const visible = card.changes.filter(row => preferred.includes(row.label));
  const effects = card.changes.filter(row => ['เมื่อยืนยัน', 'ผลกระทบ', 'ผลการลบ'].includes(row.label));
  // All source rows stay available, including tax, installments, dates and long party details.
  return <div className="asx-card-review">
    <div className="asx-card-preview">
      {amount && <><span className="asx-card-eyebrow">{amount.label}</span><strong className="asx-card-amount"><Money value={amount.value} /></strong></>}
      {subject && <p className="asx-card-subtitle">{subject.value}</p>}
    </div>
    {parties && <DocumentParties fields={card.edit!} onEdit={onEditParty} />}
    <Rows rows={visible} />
    <details className="asx-card-details">
      <summary>{tr("ดูรายละเอียดทั้งหมด")}</summary>
      <Rows rows={card.changes.filter(row => !effects.includes(row))} />
    </details>
    {effects.map((row, index) => <p key={index} className="asx-card-context"><span>{row.label}: </span>{row.value}</p>)}
  </div>;
}

/** Party tiles use the same editable values as the server proposal, including intentionally blank fields. */
function DocumentParties({ fields, onEdit }: { fields: EditField[]; onEdit?: (group: string) => void }) {
  return <div className="asx-card-parties">{(['issuer', 'client'] as const).map(role => {
    const own = role === 'issuer';
    const label = own ? tr("ผู้ออกเอกสาร") : tr("ลูกค้า");
    const name = fields.find(field => field.field === `${role}_name`)?.value;
    const content = <><span className="asx-party-copy"><small>{label}</small><strong>{name || tr("ยังไม่ระบุชื่อ")}</strong></span>
      {onEdit && <ChevronRight size={16} aria-hidden="true" />}</>;
    return onEdit ? <button key={role} type="button" className={`asx-party-tile is-${role}`} onClick={() => onEdit(role)} aria-label={own ? tr("แก้ไขข้อมูลผู้ออกเอกสาร") : tr("แก้ไขข้อมูลลูกค้า")}>{content}</button>
      : <div key={role} className={`asx-party-tile is-${role}`}>{content}</div>;
  })}</div>;
}

// Money over several months (owner, 2026-10-25: no more ASCII bars or Markdown tables). The figures come from the
// server's financial_summary; the card only draws them. A card that does not match the contract draws nothing.
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const isMoneyChart = (card: MoneyChartCard) => Array.isArray(card.months) && card.months.length <= 12 && card.months.every(month =>
  typeof month.label === 'string' && finite(month.income) && finite(month.expense) && finite(month.net)) && finite(card.totals?.income) && finite(card.totals?.expense) && finite(card.totals?.net);
function MoneyChart({ card }: { card: MoneyChartCard }) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const box = React.useRef<HTMLDivElement>(null);
  if (!isMoneyChart(card)) return null;
  const months = card.months;
  const empty = months.every(month => month.income === 0 && month.expense === 0);
  const top = Math.max(1, ...months.flatMap(month => [month.income, month.expense]));
  const height = (amount: number) => (amount > 0 ? Math.max(3, Math.round((amount / top) * 100)) : 0);
  // Month names in the reader's language (ก.ย. 2569 / Sep 2026); the server's Thai labels are the fallback.
  const named = (month: string, withYear: boolean) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? month : date.toLocaleDateString(dateLocale(), { month: 'short', ...(withYear ? { year: 'numeric' as const } : {}), timeZone: 'UTC' });
  };
  const years = new Set(months.map(month => month.month.slice(0, 4))).size > 1;
  const short = (month: MoneyChartCard['months'][number], index: number) => named(month.month, years && (index === 0 || month.month.endsWith('-01')));
  const full = (month: MoneyChartCard['months'][number]) => named(month.month, true) || month.label;
  const period = months.length ? (months.length === 1 ? full(months[0]) : `${full(months[0])} – ${full(months.at(-1)!)}`) : card.period;
  const shown = months[picked ?? months.length - 1];
  const line = (month: MoneyChartCard['months'][number]) => tr("{0} · รายรับ {1} · รายจ่าย {2} · คงเหลือ {3}", `${full(month)}${month.partial ? ` (${tr("ถึงวันนี้")})` : ''}`, formatTHB(month.income), formatTHB(month.expense), formatTHB(month.net));
  return (
    <div ref={box} className="asx-rcard is-chart">
      <Head icon={BarChart3} title={tr(card.title)} />
      <p className="asx-rcard-period">{card.omitted > 0 ? card.period : period}</p>
      <MoneyOverview totals balance={formatTHB(card.totals.net)} income={formatTHB(card.totals.income)} expense={formatTHB(card.totals.expense)} />
      {empty ? <p className="asx-chart-empty">{tr("ยังไม่มีรายรับหรือรายจ่ายในช่วงนี้")}</p> : months.length > 1 && (
        <figure className="asx-chart">
          <div className="asx-chart-legend" aria-hidden="true"><span className="is-income"><i />{tr("รายรับ")}</span><span className="is-expense"><i />{tr("รายจ่าย")}</span></div>
          <div className="asx-chart-plot" onMouseLeave={() => setPicked(null)}>
            {months.map((month, index) => (
              <button type="button" key={month.month} className={`asx-chart-group${month.partial ? ' is-partial' : ''}${picked === index ? ' is-picked' : ''}`}
                aria-label={line(month)} aria-pressed={picked === index} onMouseEnter={() => setPicked(index)} onFocus={() => setPicked(index)} onClick={() => setPicked(index)}>
                <span className="asx-chart-bars" aria-hidden="true">
                  <i className="is-income" style={{ height: `${height(month.income)}%` }} />
                  <i className="is-expense" style={{ height: `${height(month.expense)}%` }} />
                </span>
                <span className="asx-chart-label" aria-hidden="true">{short(month, index)}{month.partial ? '*' : ''}</span>
              </button>
            ))}
          </div>
          <figcaption className="asx-chart-readout" aria-live="polite">{line(shown)}</figcaption>
          {months.some(month => month.partial) && <p className="asx-chart-note">{tr("* เดือนนี้ยังไม่จบ เป็นยอดถึงวันนี้")}</p>}
        </figure>
      )}
      {card.omitted > 0 && <p className="asx-chart-note is-pad">{tr("แสดง {0} เดือนล่าสุด ยอดรวมนับทั้งช่วงที่ถาม", months.length)}</p>}
      {!empty && (
        // The opened table grows the card: bring all of it above the message box.
        <details className="asx-chart-table" onToggle={event => { if (event.currentTarget.open) requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }}>
          <summary>{tr("ดูเป็นตาราง")}</summary>
          <div className="asx-chart-scroll">
            <table>
              <thead><tr><th scope="col">{tr("เดือน")}</th><th scope="col">{tr("รายรับ")}</th><th scope="col">{tr("รายจ่าย")}</th><th scope="col">{tr("คงเหลือ")}</th></tr></thead>
              <tbody>{months.map(month => <tr key={month.month}><th scope="row">{full(month)}{month.partial ? '*' : ''}</th><td><Money value={formatTHB(month.income)} /></td><td><Money value={formatTHB(month.expense)} /></td><td><Money value={formatTHB(month.net)} /></td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// Rates read as percentages, and 0% as "no withholding" or "no VAT" (a quotation card has both); other choices, such
// as an expense category, read as themselves (2026-10-25).
const RATE_FIELDS = new Set(['wht_rate', 'vat_rate']);
const choiceLabel = (option: string, field: string) => (!RATE_FIELDS.has(field) ? tr(option) : option !== '0' ? `${option}%` : field === 'vat_rate' ? tr("ไม่มี VAT") : tr("ไม่หัก"));

type EditSection = { id: string; title: string; tab: string; note?: string; fields: EditField[] };
function partyEditFields(fields: EditField[], role: string) {
  const order = ['name', 'tax_id', 'address', 'phone', 'email'];
  return fields.filter(field => field.field.startsWith(`${role}_`)).sort((a, b) => order.indexOf(a.field.slice(role.length + 1)) - order.indexOf(b.field.slice(role.length + 1)));
}
function editSections(fields: EditField[]): EditSection[] {
  if (!fields.some(field => field.field.startsWith('issuer_'))) return [{ id: 'general', title: tr("แก้ไขข้อมูล"), tab: '', fields }];
  return [
    { id: 'issuer', title: tr("ข้อมูลผู้ออกเอกสาร"), tab: tr("ผู้ออก"), note: tr("ข้อมูลสำหรับเอกสารฉบับนี้"), fields: partyEditFields(fields, 'issuer') },
    { id: 'client', title: tr("ข้อมูลลูกค้า"), tab: tr("ลูกค้า"), note: tr("ข้อมูลผู้รับเอกสาร"), fields: partyEditFields(fields, 'client') },
    { id: 'items', title: tr("รายการสินค้าและบริการ"), tab: tr("รายการ"), fields: fields.filter(field => field.field.startsWith('item_')) },
    { id: 'document', title: tr("ภาษีและวันที่เอกสาร"), tab: tr("ภาษี"), fields: fields.filter(field => !/^(issuer|client|item)_/.test(field.field)) },
  ].filter(section => section.fields.length > 0);
}
const PARTY_EDIT_LABELS: Record<string, string> = { name: T("ชื่อ / บริษัท"), address: T("ที่อยู่"), phone: T("โทรศัพท์"), email: T("อีเมล"), tax_id: T("เลขประจำตัวผู้เสียภาษี") };

/**
 * The primary action says what will happen (DESIGN.md §4): a new job is saved, a document is created, a deletion is a
 * deletion; anything else is confirmed. Titles come from the server in Thai.
 */
function primaryAction(card: ConfirmCard): { label: string; danger: boolean } {
  const title = card.title;
  if (title.startsWith('เพิ่มงานใหม่')) return { label: tr("บันทึกงาน"), danger: false };
  const doc = card.changes.find(row => row.label === 'เอกสาร')?.value.split(' ')[0];
  if (title.startsWith('สร้าง') && doc) return { label: tr("สร้าง{0}", tr(doc)), danger: false };
  if (title.startsWith('ลบ')) return { label: tr("ลบรายการนี้"), danger: true };
  return { label: tr("ยืนยัน"), danger: false };
}
const STATE_OF: Record<ConfirmState, CardState['tone']> = { pending: 'wait', working: 'busy', done: 'done', failed: 'failed', cancelled: 'muted', expired: 'muted' };

function Confirm({ card, state, onConfirm, onCancel, onAsk, confirmedPath, onNavigate, onRevise }: { card: ConfirmCard; state: ConfirmState; onConfirm: () => void; onCancel?: () => void; onAsk?: (text: string) => void; confirmedPath?: string; onNavigate: (path: string) => void; onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void> }) {
  const live = React.useContext(LiveContext);
  const [editing, setEditing] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState('issuer');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [otherRate, setOtherRate] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fields = card.edit ?? [];
  const sections = editSections(fields);
  const section = sections.find(item => item.id === activeSection) ?? sections[0];
  const canEdit = live && Boolean(onRevise) && fields.length > 0 && state === 'pending';
  const box = React.useRef<HTMLDivElement>(null);
  const editScroll = React.useRef<HTMLDivElement>(null);
  const editorId = React.useId();
  const action = primaryAction(card);
  React.useEffect(() => { if (editing) requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'nearest' })); }, [editing]);
  React.useEffect(() => { if (editScroll.current) editScroll.current.scrollTop = 0; }, [activeSection]);
  const startEdit = (group?: string) => {
    setValues(Object.fromEntries(fields.map(field => [field.field, field.value])));
    setOtherRate(Object.fromEntries(fields.filter(field => field.field === 'wht_rate').map(field => [field.field, !(field.options ?? []).includes(field.value)])));
    setActiveSection(group ?? sections[0].id); setProblem(null); setEditing(true);
  };
  const saveEdit = async () => {
    const missingName = fields.find(field => /^(issuer|client)_name$/.test(field.field) && !(values[field.field] ?? '').trim());
    if (missingName) {
      setActiveSection(missingName.field.startsWith('issuer_') ? 'issuer' : 'client');
      setProblem(tr("กรุณากรอกชื่อผู้ออกเอกสารและชื่อลูกค้า")); return;
    }
    // A withholding rate typed by hand: a percentage the app accepts (0-100, at most two decimals).
    const rate = fields.find(field => field.field === 'wht_rate');
    if (rate && !isValidWhtRate(Number(values[rate.field])) || (rate && (values[rate.field] ?? '').trim() === '')) {
      const tab = editSections(fields).find(item => item.fields.includes(rate!));
      if (tab) setActiveSection(tab.id);
      setProblem(tr("กรุณากรอกอัตราหัก ณ ที่จ่ายเป็นตัวเลข 0–100")); return;
    }
    const changed = Object.fromEntries(fields.filter(field => (values[field.field] ?? '') !== field.value).map(field => [field.field, values[field.field] ?? '']));
    if (!Object.keys(changed).length) { setEditing(false); return; }
    setSaving(true); setProblem(null);
    try { await onRevise!(card, changed); setEditing(false); }
    catch (error) { setProblem((error as Error)?.message || tr("แก้รายการนี้ไม่สำเร็จ")); }
    finally { setSaving(false); }
  };
  const changeValue = (field: string, value: string) => setValues(current => ({ ...current, [field]: value }));
  const stateText: Record<ConfirmState, string> = {
    pending: tr("รอยืนยัน"), working: tr("กำลังบันทึก"), done: live ? tr("บันทึกแล้ว") : tr("ยืนยันแล้ว"),
    failed: tr("ไม่สำเร็จ"), cancelled: tr("ยกเลิกแล้ว"), expired: tr("หมดเวลา"),
  };
  const kindIcon = card.changes.some(row => row.label === 'เอกสาร') ? FileText : card.title.startsWith('เพิ่มงาน') ? Briefcase : ListChecks;
  return (
    <div ref={box} className={`asx-rcard is-confirm is-${state}${editing ? ' is-editing' : ''}`} aria-busy={saving || state === 'working'}>
      <Head icon={kindIcon} title={card.title} state={{ tone: STATE_OF[state], text: stateText[state] }} />
      {editing ? <div className="asx-edit-sections">
        {sections.length > 1 && <div className="asx-edit-tabs" role="tablist" aria-label={tr("ส่วนของเอกสาร")}>
          {sections.map((item, index) => <button key={item.id} type="button" role="tab" id={`${editorId}-${item.id}-tab`} aria-controls={`${editorId}-panel`} aria-selected={section.id === item.id}
            tabIndex={section.id === item.id ? 0 : -1} disabled={saving} onClick={() => setActiveSection(item.id)}
            onKeyDown={event => {
              const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault(); setActiveSection(sections[next].id);
              (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}>{item.tab}</button>)}
        </div>}
        <div ref={editScroll} className="asx-edit-scroll" id={`${editorId}-panel`} role={sections.length > 1 ? 'tabpanel' : undefined} aria-labelledby={sections.length > 1 ? `${editorId}-${section.id}-tab` : undefined}>
          <fieldset className={`asx-edit-section is-${section.id}`} disabled={saving}>
            <legend>{section.title}</legend>
            {section.note && <p className="asx-edit-note">{section.note}</p>}
            <div className="asx-edit-list">{section.fields.map(field => {
              const partyKey = /^(issuer|client)_(.+)$/.exec(field.field)?.[2];
              const label = partyKey ? tr(PARTY_EDIT_LABELS[partyKey] ?? field.label) : tr(field.label);
              const required = partyKey === 'name';
              // Withholding: the usual rates, or any other rate typed by hand (owner, 2026-10-27: "หักเกิน 3% ล่ะ").
              if (field.field === 'wht_rate') {
                const rates = field.options ?? [];
                const other = otherRate[field.field] ?? !rates.includes(values[field.field] ?? '');
                return <div key={field.field} className="asx-edit-row">
                  <label htmlFor={`${editorId}-wht`}>{label}</label>
                  <select id={`${editorId}-wht`} value={other ? 'other' : values[field.field] ?? ''} onChange={event => {
                    const next = event.target.value;
                    setOtherRate(state => ({ ...state, [field.field]: next === 'other' }));
                    if (next !== 'other') changeValue(field.field, next);
                  }}>
                    {rates.map(option => <option key={option} value={option}>{choiceLabel(option, field.field)}</option>)}
                    <option value="other">{tr("อัตราอื่น")}</option>
                  </select>
                  {other && <span className="asx-edit-rate">
                    <input type="text" inputMode="decimal" aria-label={tr("อัตราหัก ณ ที่จ่าย (%)")} value={values[field.field] ?? ''} maxLength={6} placeholder="10"
                      onChange={event => changeValue(field.field, event.target.value.replace(/[^\d.]/g, ''))} />
                    <span aria-hidden="true">%</span>
                  </span>}
                </div>;
              }
              return <label key={field.field} className="asx-edit-row">
                <span>{label}{required && <span aria-hidden="true"> *</span>}</span>
                {field.type === 'choice' ? <select value={values[field.field] ?? ''} onChange={event => changeValue(field.field, event.target.value)}>
                  {(field.options ?? []).map(option => <option key={option} value={option}>{choiceLabel(option, field.field)}</option>)}
                </select> : partyKey === 'address' ? <textarea rows={3} value={values[field.field] ?? ''} maxLength={200} placeholder={tr("เพิ่มที่อยู่")} onChange={event => changeValue(field.field, event.target.value)} />
                : <input type={field.type === 'date' ? 'date' : partyKey === 'email' ? 'email' : partyKey === 'phone' ? 'tel' : 'text'}
                    inputMode={field.type === 'money' ? 'decimal' : partyKey === 'tax_id' ? 'numeric' : undefined}
                    value={values[field.field] ?? ''} maxLength={200} required={required} placeholder={partyKey && !required ? tr("ยังไม่ระบุ") : undefined}
                    onChange={event => changeValue(field.field, event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveEdit(); } }} />}
              </label>;
            })}</div>
          </fieldset>
        </div>
        {problem && <p className="asx-edit-problem" role="alert"><AlertCircle size={14} />{problem}</p>}
      </div> : <ConfirmPreview card={card} onEditParty={canEdit ? startEdit : undefined} />}
      {editing ? (
        <div className="asx-rcard-actions">
          <button type="button" className="asx-pill-btn is-primary" onClick={() => void saveEdit()} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{tr("ตรวจสอบข้อมูล")}
          </button>
          <div className="asx-rcard-secondary">
            <button type="button" className="asx-pill-btn" onClick={() => { setEditing(false); setProblem(null); }} disabled={saving}>{tr("ยกเลิกการแก้ไข")}</button>
          </div>
        </div>
      ) : state === 'pending' || state === 'working' ? (
        <div className="asx-rcard-actions">
          <button type="button" className={`asx-pill-btn is-primary${action.danger ? ' is-danger' : ''}`} onClick={onConfirm} disabled={state === 'working'}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{state === 'working' ? tr("กำลังบันทึก") : action.label}
          </button>
          {(canEdit || onCancel) && state === 'pending' && <div className="asx-rcard-secondary">
            {canEdit && <button type="button" className="asx-pill-btn asx-edit-btn" onClick={() => startEdit()}><Pencil size={14} />{tr("แก้ไข")}</button>}
            {onCancel && <button type="button" className="asx-pill-btn" onClick={onCancel}>{tr("ยกเลิก")}</button>}
          </div>}
        </div>
      ) : (state !== 'done' || !live || confirmedPath) && (
        <div className={`asx-rcard-result is-${state}`} role="status">
          {state === 'done' && <>{!live && <p>{tr("ยืนยันแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง")}</p>}{confirmedPath && <button type="button" className="asx-pill-btn" onClick={() => onNavigate(confirmedPath)}>{tr('เปิดเอกสาร')}</button>}</>}
          {state === 'failed' && <><p>{tr("ทำรายการไม่สำเร็จ")}</p><button type="button" className="asx-pill-btn is-primary" onClick={onConfirm}>{tr("ลองอีกครั้ง")}</button></>}
          {state === 'cancelled' && <p>{tr("ยกเลิกรายการนี้แล้ว")}</p>}
          {state === 'expired' && <><p>{tr("รายการนี้หมดเวลายืนยันแล้ว ขอให้เลขาเตรียมใหม่ได้")}</p>{onAsk && <button type="button" className="asx-pill-btn" onClick={() => onAsk(tr("ช่วยเตรียม \"{0}\" ใหม่อีกครั้ง", card.title))}>{tr("เตรียมใหม่")}</button>}</>}
        </div>
      )}
    </div>
  );
}

/**
 * Tap-to-answer questions: tap a choice (or type where only the user knows), then ส่งคำตอบ sends every answer as one
 * message and เลขา carries on. An older card, already answered or overtaken by the chat, stays read-only.
 * Owner, 2026-10-25: a date is picked on a calendar; when the client pays is "ชำระวันไหน" (calendar) with "มีเครดิตเทอม
 * ไหม" (ไม่มี / มี, then the app's own days); a party's details are a small form, prefilled where known.
 */
const PARTY_LABELS: Record<keyof PartyValues, string> = { name: T("ชื่อ"), address: T("ที่อยู่"), taxId: T("เลขประจำตัวผู้เสียภาษี"), phone: T("โทรศัพท์") };
/**
 * Withholding questions always offer the usual Thai rates with what each is for, and any other rate typed by hand
 * (owner, 2026-10-27: "ถ้าหักเกิน 3% ... มึงไม่มีทางเลือกให้เขาได้เลือกเลยเหรอ"). The model's own other options stay.
 */
const WHT_CHOICES: { rate: string; hint?: string }[] = [
  { rate: T("ไม่หัก") }, { rate: '1%', hint: T("ค่าขนส่ง") }, { rate: '2%', hint: T("ค่าโฆษณา") },
  { rate: '3%', hint: T("ค่าบริการ ค่าจ้าง ฟรีแลนซ์") }, { rate: '5%', hint: T("ค่าเช่า") },
];
const isWhtQuestion = (question: AskQuestion) => (!question.kind || question.kind === 'choice') && /หัก\s*ณ\s*ที่\s*จ่าย|withholding/i.test(question.text);
const rateOf = (option: string) => /^\s*(?:หัก\s*)?(\d+(?:\.\d+)?)\s*%/.exec(option)?.[1];
function choicesFor(question: AskQuestion): { value: string; label: string; hint?: string }[] {
  if (!isWhtQuestion(question)) return question.options.map(option => ({ value: option, label: option }));
  const standard = WHT_CHOICES.map(choice => ({ value: tr(choice.rate), label: tr(choice.rate), hint: choice.hint && tr(choice.hint) }));
  const known = new Set(['0', '1', '2', '3', '5']);
  const extra = question.options.filter(option => { const rate = rateOf(option); return rate ? !known.has(rate) : !/ไม่หัก|^0\s*%?$/.test(option); });
  return [...standard, ...extra.map(option => ({ value: option, label: option }))];
}

function Questions({ card, onAnswer, answered }: { card: QuestionsCard; onAnswer?: (text: string) => void; answered?: boolean }) {
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [dates, setDates] = React.useState<Record<string, string>>({});
  const [term, setTerm] = React.useState<Record<string, 'none' | number>>({});
  const [party, setParty] = React.useState<Record<string, PartyValues>>(() =>
    Object.fromEntries(card.questions.filter(question => question.kind === 'party').map(question => [question.id, { ...question.prefill }])));
  const [sent, setSent] = React.useState(false);
  const done = sent || answered || !onAnswer;
  const answerOf = (question: AskQuestion): string => {
    if (question.kind === 'date') return dates[question.id] ? thaiDateAnswer(dates[question.id]) : '';
    if (question.kind === 'payment') {
      const chosen = term[question.id];
      return chosen === undefined ? '' : paymentAnswer(dates[question.id] || '', chosen);
    }
    if (question.kind === 'party') return party[question.id]?.name?.trim() ? partyAnswer(party[question.id]) : '';
    const own = typed[question.id]?.trim();
    if (own) return isWhtQuestion(question) && /^\d+(\.\d+)?$/.test(own) ? `${own}%` : own;
    return picked[question.id] || '';
  };
  const answeredCount = card.questions.filter(question => answerOf(question)).length;
  const ready = answeredCount === card.questions.length;
  const submit = () => {
    if (!ready || done) return;
    setSent(true);
    onAnswer?.(card.questions.map(question => (question.kind === 'payment' ? answerOf(question)
      : `${question.text.replace(/[?？]\s*$/, '').trim()}: ${answerOf(question)}`)).join('\n'));
  };
  const total = card.questions.length;
  return (
    <div className={`asx-rcard is-questions${done ? ' is-done' : ''}`}>
      <Head icon={ListChecks} title={total > 1 ? tr("ขอข้อมูลเพิ่ม {0} ข้อ", total) : tr("ขอข้อมูลเพิ่ม")}
        state={done ? { tone: 'done', text: tr("ส่งคำตอบแล้ว") } : total > 1 ? { tone: 'wait', text: tr("{0} / {1}", answeredCount, total) } : undefined} />
      <div className="asx-q-list">
        {card.questions.map(question => {
          const wht = isWhtQuestion(question);
          return (
          <fieldset key={question.id} className={`asx-q${question.kind && question.kind !== 'choice' ? ` is-${question.kind}` : ''}${wht ? ' is-wht' : ''}`} disabled={done}>
            <legend>{question.text}</legend>
            {question.kind === 'date' && (
              <div className="asx-q-group">
                <label className="asx-q-line"><span>{tr("วันที่")}</span>
                  <input type="date" className="asx-q-input asx-q-date" aria-label={question.text} value={dates[question.id] ?? ''}
                    onChange={event => setDates(state => ({ ...state, [question.id]: event.target.value }))} /></label>
              </div>
            )}
            {question.kind === 'payment' && (<>
              <div className="asx-q-group">
                <label className="asx-q-line"><span>{tr("ชำระวันไหน")}</span>
                  <input type="date" className="asx-q-input asx-q-date" value={dates[question.id] ?? ''}
                    onChange={event => setDates(state => ({ ...state, [question.id]: event.target.value }))} /></label>
              </div>
              <p className="asx-q-hint">{tr("เว้นว่างได้ถ้ายังไม่รู้วัน")}</p>
              <div className="asx-q-field" role="radiogroup" aria-label={tr("เครดิตเทอม")}>
                <span className="asx-q-sub" aria-hidden="true">{tr("เครดิตเทอม (วัน)")}</span>
                <div className="asx-q-seg">
                  {(['none', ...(question.terms ?? []).filter(days => days > 0)] as ('none' | number)[]).map(option => (
                    <button key={String(option)} type="button" role="radio" aria-checked={term[question.id] === option}
                      aria-label={option === 'none' ? tr("ไม่มีเครดิตเทอม") : tr("{0} วัน", option)}
                      onClick={() => setTerm(state => ({ ...state, [question.id]: option }))}>{option === 'none' ? tr("ไม่มี") : option}</button>
                  ))}
                </div>
              </div>
            </>)}
            {question.kind === 'party' && (
              <div className="asx-q-group">
                {(Object.keys(PARTY_LABELS) as (keyof PartyValues)[]).map(key => {
                  const value = party[question.id]?.[key] ?? '';
                  const change = (next: string) => setParty(state => ({ ...state, [question.id]: { ...state[question.id], [key]: next } }));
                  return (
                    <label key={key} className={`asx-q-line is-${key}`}>
                      <span>{tr(PARTY_LABELS[key])}</span>
                      {key === 'address'
                        ? <textarea className="asx-q-input" rows={2} maxLength={500} value={value} placeholder={tr("ไม่บังคับ")} onChange={event => change(event.target.value)} />
                        : <input className="asx-q-input" value={value} maxLength={key === 'name' ? 200 : key === 'taxId' ? 30 : 50} placeholder={key === 'name' ? undefined : tr("ไม่บังคับ")}
                            inputMode={key === 'taxId' || key === 'phone' ? 'numeric' : undefined} onChange={event => change(event.target.value)} />}
                    </label>
                  );
                })}
              </div>
            )}
            {(!question.kind || question.kind === 'choice') && (
              <div className="asx-q-group" role="radiogroup" aria-label={question.text}>
                {choicesFor(question).map(choice => {
                  const on = !typed[question.id]?.trim() && picked[question.id] === choice.value;
                  return (
                    <button key={choice.value} type="button" role="radio" aria-checked={on} className="asx-q-row"
                      onClick={() => { setPicked(state => ({ ...state, [question.id]: choice.value })); setTyped(state => ({ ...state, [question.id]: '' })); }}>
                      <span className="asx-q-row-text">{choice.label}{choice.hint && <small>{choice.hint}</small>}</span><span className="asx-q-tick" aria-hidden="true" />
                    </button>
                  );
                })}
                {(question.allowText || wht) && (
                  <label className={`asx-q-row is-typed${typed[question.id]?.trim() ? ' is-on' : ''}`}>
                    <span className="asx-q-row-text">{wht ? tr("อัตราอื่น") : question.options.length ? tr("หรือพิมพ์เอง") : tr("พิมพ์คำตอบ")}</span>
                    <input className="asx-q-input" value={typed[question.id] ?? ''} maxLength={wht ? 6 : 200} aria-label={wht ? tr("อัตราหัก ณ ที่จ่ายอื่น (%)") : question.text}
                      inputMode={wht ? 'decimal' : undefined} placeholder={wht ? '10' : question.placeholder || undefined}
                      onChange={event => setTyped(state => ({ ...state, [question.id]: wht ? event.target.value.replace(/[^\d.]/g, '') : event.target.value }))}
                      onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
                    {wht && <span aria-hidden="true">%</span>}
                  </label>
                )}
              </div>
            )}
            {wht && <p className="asx-q-hint">{tr("ไม่แน่ใจ ดูได้ในหนังสือรับรอง 50 ทวิ ที่ลูกค้าให้")}</p>}
          </fieldset>
          );
        })}
      </div>
      <div className="asx-rcard-actions">
        <button type="button" className="asx-pill-btn is-primary" onClick={submit} disabled={!ready || done}>
          {done ? <><Check size={14} />{tr("ส่งคำตอบแล้ว")}</> : <><Send size={14} />{tr("ส่งคำตอบ")}</>}
        </button>
        {!done && total > 1 && <p className="asx-rcard-note">{tr("ตอบแล้ว {0} จาก {1} ข้อ", answeredCount, total)}</p>}
      </div>
    </div>
  );
}

/** Changing the account's name (owner, 2026-10-27: "อิงชื่อตามชื่อ account ... ให้มันเอาการ์ดมาแล้วก็ให้กรอกชื่อใหม่"): the
 *  name is typed or checked here and saved through the profile API, as in Settings; เลขา then calls the user by it.
 *  A sample answer changes nothing. */
function Rename({ card }: { card: RenameCard }) {
  const live = React.useContext(LiveContext);
  const [name, setName] = React.useState(card.suggested || card.current);
  const [state, setState] = React.useState<'pending' | 'working' | 'done' | 'failed' | 'cancelled'>('pending');
  const [problem, setProblem] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState('');
  const save = async () => {
    const value = name.trim();
    if (value.length < 2 || value.length > 60) { setProblem(tr("ชื่อต้องมี 2–60 ตัวอักษร")); return; }
    setProblem(null);
    if (!live) { setSaved(value); setState('done'); return; }
    setState('working');
    try { setSaved(await saveAccountName(value)); setState('done'); }
    catch (error) { setProblem((error as Error)?.message || tr("บันทึกชื่อไม่สำเร็จ")); setState('failed'); }
  };
  const status: CardState = state === 'done' ? { tone: 'done', text: tr("บันทึกแล้ว") } : state === 'working' ? { tone: 'busy', text: tr("กำลังบันทึก") }
    : state === 'cancelled' ? { tone: 'muted', text: tr("ยกเลิกแล้ว") } : state === 'failed' ? { tone: 'failed', text: tr("ไม่สำเร็จ") } : { tone: 'wait', text: tr("รอบันทึก") };
  return (
    <div className="asx-rcard is-rename">
      <Head icon={UserRound} title={tr("ชื่อบัญชี")} state={status} />
      {state === 'done' ? <>
        <Rows rows={[{ label: tr("ชื่อที่ใช้ในบัญชี"), value: saved }]} />
        <div className="asx-rcard-result is-done" role="status"><p>{live ? tr("บันทึกชื่อแล้ว ต่อไปเลขากระรอกจะเรียกตามชื่อนี้") : tr("บันทึกแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง")}</p></div>
      </> : state === 'cancelled' ? (
        <div className="asx-rcard-result is-cancelled" role="status"><p>{tr("ไม่เปลี่ยนชื่อ ใช้ชื่อเดิมต่อไป")}</p></div>
      ) : <>
        {card.current && card.current !== name.trim() && <Rows rows={[{ label: tr("ชื่อตอนนี้"), value: card.current }]} />}
        <div className="asx-edit-list">
          <label className="asx-edit-row">
            <span>{tr("ชื่อที่ใช้ในบัญชี")}</span>
            <input type="text" value={name} maxLength={60} autoComplete="name" disabled={state === 'working'} placeholder={tr("พิมพ์ชื่อใหม่")}
              onChange={event => { setName(event.target.value); setProblem(null); }}
              onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); } }} />
          </label>
        </div>
        <p className="asx-edit-note">{tr("ชื่อนี้จะแสดงในแอป ในทีม และเป็นชื่อที่เลขากระรอกใช้เรียกคุณ")}</p>
        {problem && <p className="asx-edit-problem" role="alert"><AlertCircle size={14} />{problem}</p>}
        <div className="asx-rcard-actions">
          <button type="button" className="asx-pill-btn is-primary" onClick={() => void save()} disabled={state === 'working' || name.trim().length < 2}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{state === 'working' ? tr("กำลังบันทึก") : tr("บันทึกชื่อ")}
          </button>
          {state !== 'working' && <div className="asx-rcard-secondary">
            <button type="button" className="asx-pill-btn" onClick={() => setState('cancelled')}>{tr("ยกเลิก")}</button>
          </div>}
        </div>
      </>}
    </div>
  );
}

export function ChatCardView({ live = false, ...props }: {
  card: ChatCard; confirmState?: ConfirmState; confirmedPath?: string; onConfirm: (card: ConfirmCard) => void; onCancel: (card: ConfirmCard) => void; onNavigate: (path: string) => void;
  onLineDue?: (action: LineDueAction, item: LineItem) => void;
  /** Answers to a questions card, sent as the user's next message; `answered` makes an older card read-only. */
  onAnswer?: (text: string) => void; answered?: boolean;
  /** Fields changed on a confirmation card: the card is prepared again and replaced. */
  onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void>;
  /** Sends a message for the user, e.g. "prepare it again" on an expired confirmation. */
  onAsk?: (text: string) => void;
  /** A real answer, not sample data. */
  live?: boolean;
}) {
  return <LiveContext.Provider value={live}><CardBody {...props} /></LiveContext.Provider>;
}

function CardBody({ card, confirmState, confirmedPath, onConfirm, onCancel, onNavigate, onLineDue, onAnswer, answered, onRevise, onAsk }: {
  card: ChatCard; confirmState?: ConfirmState; confirmedPath?: string; onConfirm: (card: ConfirmCard) => void; onCancel: (card: ConfirmCard) => void; onNavigate: (path: string) => void;
  onLineDue?: (action: LineDueAction, item: LineItem) => void; onAnswer?: (text: string) => void; answered?: boolean;
  onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void>; onAsk?: (text: string) => void;
}) {
  switch (card.kind) {
    case 'navigation': return <button type="button" className="asx-pill-btn asx-feature-link" onClick={() => onNavigate(card.path)}>{card.label}<ArrowUpRight size={14} aria-hidden="true" /></button>;
    case 'project': return <Project card={card} onNavigate={onNavigate} />;
    case 'document': return <Document card={card} onNavigate={onNavigate} />;
    case 'summary': return <Summary card={card} />;
    case 'money_chart': return <MoneyChart card={card} />;
    case 'confirm': return <Confirm key={card.id} card={card} state={confirmState ?? 'pending'} onConfirm={() => onConfirm(card)} onCancel={() => onCancel(card)} onAsk={onAsk} confirmedPath={confirmedPath} onNavigate={onNavigate} onRevise={onRevise} />;
    case 'line': return <LineCard card={card.card} onDue={onLineDue} onOpen={onNavigate} />;
    case 'questions': return <Questions card={card} onAnswer={onAnswer} answered={answered} />;
    case 'official_link': return <OfficialLink card={card} />;
    case 'rename': return <Rename card={card} />;
  }
}
