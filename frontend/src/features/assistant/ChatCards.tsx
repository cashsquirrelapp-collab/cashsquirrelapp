import React from 'react';
import { AlertCircle, ArrowUpRight, BarChart3, Briefcase, Check, CheckCircle2, ChevronRight, FileText, Landmark, ListChecks, Loader2, Pencil, Send, X } from 'lucide-react';
import { tr, T } from '../../i18n/tr';
import { partyAnswer, paymentAnswer, thaiDateAnswer, type PartyValues } from '../../../../shared/askQuestions';
import type { ChatCard, ConfirmCard, DocumentCard, EditField, MoneyChartCard, OfficialLinkCard, ProjectCard, QuestionsCard, SummaryCard } from './assistantMock';
import { formatTHB } from '../../../../shared/thb';
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

function Head({ icon: Icon, title }: { icon: typeof Briefcase; title: string }) {
  const live = React.useContext(LiveContext);
  return <div className="asx-rcard-head"><span className="asx-rcard-icon"><Icon size={16} strokeWidth={1.9} /></span><b>{title}</b>{!live && <SampleTag />}</div>;
}

function Rows({ rows }: { rows: { label: string; value: string; tone?: 'income' | 'expense' }[] }) {
  return (
    <dl className="asx-rcard-rows">
      {rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</dd></div>)}
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
        <p className="asx-card-subtitle">{card.name}</p>
        <p className="asx-card-eyebrow">{card.client}</p>
        <span className="asx-card-eyebrow">{tr("มูลค่างาน")}</span><strong className="asx-card-amount">{card.amount}</strong>
        <span className="asx-card-status">{card.status}</span>
      </div>
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
        <p className="asx-card-eyebrow">{card.number}</p>
        <p className="asx-card-subtitle">{card.client}</p>
        <span className="asx-card-eyebrow">{tr("ยอดเงิน")}</span><strong className="asx-card-amount">{card.amount}</strong>
      </div>
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
    <div className="asx-card-preview"><span className="asx-card-eyebrow">{tr("เงินคงเหลือ")}</span><strong className="asx-card-amount">{balance}</strong></div>
    <dl className="asx-card-metrics">
      <div><dt>{totals ? tr("รายรับรวม") : tr("รายรับ")}</dt><dd className="is-income">{income}</dd></div>
      <div><dt>{totals ? tr("รายจ่ายรวม") : tr("รายจ่าย")}</dt><dd className="is-expense">{expense}</dd></div>
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
      {subject && <p className="asx-card-subtitle">{subject.value}</p>}
      {amount && <><span className="asx-card-eyebrow">{amount.label}</span><strong className="asx-card-amount">{amount.value}</strong></>}
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
              <tbody>{months.map(month => <tr key={month.month}><th scope="row">{full(month)}{month.partial ? '*' : ''}</th><td>{formatTHB(month.income)}</td><td>{formatTHB(month.expense)}</td><td>{formatTHB(month.net)}</td></tr>)}</tbody>
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

function Confirm({ card, state, onConfirm, confirmedPath, onNavigate, onRevise }: { card: ConfirmCard; state: ConfirmState; onConfirm: () => void; confirmedPath?: string; onNavigate: (path: string) => void; onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void> }) {
  const live = React.useContext(LiveContext);
  const [editing, setEditing] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState('issuer');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fields = card.edit ?? [];
  const sections = editSections(fields);
  const section = sections.find(item => item.id === activeSection) ?? sections[0];
  const canEdit = live && Boolean(onRevise) && fields.length > 0 && state === 'pending';
  const box = React.useRef<HTMLDivElement>(null);
  const editScroll = React.useRef<HTMLDivElement>(null);
  const editorId = React.useId();
  React.useEffect(() => { if (editing) requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'nearest' })); }, [editing]);
  React.useEffect(() => { if (editScroll.current) editScroll.current.scrollTop = 0; }, [activeSection]);
  const startEdit = (group?: string) => {
    setValues(Object.fromEntries(fields.map(field => [field.field, field.value])));
    setActiveSection(group ?? sections[0].id); setProblem(null); setEditing(true);
  };
  const saveEdit = async () => {
    const missingName = fields.find(field => /^(issuer|client)_name$/.test(field.field) && !(values[field.field] ?? '').trim());
    if (missingName) {
      setActiveSection(missingName.field.startsWith('issuer_') ? 'issuer' : 'client');
      setProblem(tr("กรุณากรอกชื่อผู้ออกเอกสารและชื่อลูกค้า")); return;
    }
    const changed = Object.fromEntries(fields.filter(field => (values[field.field] ?? '') !== field.value).map(field => [field.field, values[field.field] ?? '']));
    if (!Object.keys(changed).length) { setEditing(false); return; }
    setSaving(true); setProblem(null);
    try { await onRevise!(card, changed); setEditing(false); }
    catch (error) { setProblem((error as Error)?.message || tr("แก้รายการนี้ไม่สำเร็จ")); }
    finally { setSaving(false); }
  };
  const changeValue = (field: string, value: string) => setValues(current => ({ ...current, [field]: value }));
  return (
    <div ref={box} className={`asx-rcard is-confirm is-${state}${editing ? ' is-editing' : ''}`} aria-busy={saving || state === 'working'}>
      <Head icon={state === 'done' ? CheckCircle2 : card.changes.some(row => row.label === 'เอกสาร') ? FileText : ListChecks} title={card.title} />
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
          <button type="button" className="asx-pill-btn" onClick={() => { setEditing(false); setProblem(null); }} disabled={saving}>{tr("ยกเลิก")}</button>
          <button type="button" className="asx-pill-btn is-primary" onClick={() => void saveEdit()} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{tr("ตรวจสอบข้อมูล")}
          </button>
        </div>
      ) : state === 'pending' || state === 'working' ? (
        <div className="asx-rcard-actions">
          {canEdit && <button type="button" className="asx-pill-btn asx-edit-btn" onClick={() => startEdit()}><Pencil size={14} />{tr("แก้ไข")}</button>}
          <button type="button" className="asx-pill-btn is-primary" onClick={onConfirm} disabled={state === 'working'}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{state === 'working' ? tr("กำลังบันทึก") : tr("ยืนยัน")}
          </button>
        </div>
      ) : (
        <p className={`asx-rcard-result is-${state}`} role="status">
          {state === 'done' && <><CheckCircle2 size={16} />{live ? tr("บันทึกแล้ว") : tr("ยืนยันแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง")}{confirmedPath && <button type="button" className="asx-link-btn" onClick={() => onNavigate(confirmedPath)}>{tr('เปิดเอกสาร')}</button>}</>}
          {state === 'failed' && <><AlertCircle size={16} />{tr("ทำรายการไม่สำเร็จ")}<button type="button" className="asx-link-btn" onClick={onConfirm}>{tr("ลองอีกครั้ง")}</button></>}
          {state === 'cancelled' && <><X size={16} />{tr("ยกเลิกรายการนี้แล้ว")}</>}
          {state === 'expired' && <><X size={16} />{tr("รายการนี้หมดเวลายืนยันแล้ว ขอให้เลขาเตรียมใหม่ได้")}</>}
        </p>
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
function Questions({ card, onAnswer, answered }: { card: QuestionsCard; onAnswer?: (text: string) => void; answered?: boolean }) {
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [dates, setDates] = React.useState<Record<string, string>>({});
  const [credit, setCredit] = React.useState<Record<string, 'none' | 'yes'>>({});
  const [days, setDays] = React.useState<Record<string, number>>({});
  const [party, setParty] = React.useState<Record<string, PartyValues>>(() =>
    Object.fromEntries(card.questions.filter(question => question.kind === 'party').map(question => [question.id, { ...question.prefill }])));
  const [sent, setSent] = React.useState(false);
  const done = sent || answered || !onAnswer;
  const answerOf = (question: QuestionsCard['questions'][number]): string => {
    if (question.kind === 'date') return dates[question.id] ? thaiDateAnswer(dates[question.id]) : '';
    if (question.kind === 'payment') {
      const choice = credit[question.id];
      if (!choice || (choice === 'yes' && days[question.id] === undefined)) return '';
      return paymentAnswer(dates[question.id] || '', choice === 'none' ? 'none' : days[question.id]);
    }
    if (question.kind === 'party') return party[question.id]?.name?.trim() ? partyAnswer(party[question.id]) : '';
    return typed[question.id]?.trim() || picked[question.id] || '';
  };
  const ready = card.questions.every(question => answerOf(question));
  const submit = () => {
    if (!ready || done) return;
    setSent(true);
    onAnswer?.(card.questions.map(question => (question.kind === 'payment' ? answerOf(question)
      : `${question.text.replace(/[?？]\s*$/, '').trim()}: ${answerOf(question)}`)).join('\n'));
  };
  const chip = (key: string, label: string, on: boolean, pick: () => void) => (
    <button key={key} type="button" className="asx-q-chip" aria-pressed={on} onClick={pick}>
      {on && <Check size={14} strokeWidth={2.2} aria-hidden="true" />}{label}
    </button>
  );
  return (
    <div className={`asx-rcard is-questions${done ? ' is-done' : ''}`}>
      <div className="asx-rcard-head"><span className="asx-rcard-icon"><ListChecks size={16} strokeWidth={1.9} /></span><b>{tr("เลือกคำตอบได้เลย")}</b></div>
      <div className="asx-q-list">
        {card.questions.map(question => (
          <fieldset key={question.id} className={`asx-q${question.kind && question.kind !== 'choice' ? ` is-${question.kind}` : ''}`} disabled={done}>
            <legend>{question.text}</legend>
            {question.kind === 'date' && (
              <input type="date" className="asx-q-input asx-q-date" aria-label={question.text} value={dates[question.id] ?? ''}
                onChange={event => setDates(state => ({ ...state, [question.id]: event.target.value }))} />
            )}
            {question.kind === 'payment' && (<>
              <label className="asx-q-field">
                <span className="asx-q-sub">{tr("ชำระวันไหน")}</span>
                <input type="date" className="asx-q-input asx-q-date" value={dates[question.id] ?? ''}
                  onChange={event => setDates(state => ({ ...state, [question.id]: event.target.value }))} />
                <span className="asx-q-hint">{tr("เว้นว่างได้ถ้ายังไม่รู้วัน")}</span>
              </label>
              <div className="asx-q-field" role="group" aria-label={tr("มีเครดิตเทอมไหม")}>
                <span className="asx-q-sub" aria-hidden="true">{tr("มีเครดิตเทอมไหม")}</span>
                <div className="asx-q-options">
                  {chip('none', tr("ไม่มี"), credit[question.id] === 'none', () => setCredit(state => ({ ...state, [question.id]: 'none' })))}
                  {chip('yes', tr("มี"), credit[question.id] === 'yes', () => setCredit(state => ({ ...state, [question.id]: 'yes' })))}
                </div>
              </div>
              {credit[question.id] === 'yes' && (
                <div className="asx-q-field" role="group" aria-label={tr("เครดิตเทอมกี่วัน")}>
                  <span className="asx-q-sub" aria-hidden="true">{tr("เครดิตเทอมกี่วัน")}</span>
                  <div className="asx-q-options">
                    {(question.terms ?? []).map(term => chip(String(term), tr("{0} วัน", term), days[question.id] === term, () => setDays(state => ({ ...state, [question.id]: term }))))}
                  </div>
                </div>
              )}
            </>)}
            {question.kind === 'party' && (
              <div className="asx-q-fields">
                {(Object.keys(PARTY_LABELS) as (keyof PartyValues)[]).map(key => {
                  const value = party[question.id]?.[key] ?? '';
                  const change = (next: string) => setParty(state => ({ ...state, [question.id]: { ...state[question.id], [key]: next } }));
                  return (
                    <label key={key} className={`asx-q-field is-${key}`}>
                      <span className="asx-q-sub">{tr(PARTY_LABELS[key])}{key !== 'name' && <em>{' '}{tr("ไม่บังคับ")}</em>}</span>
                      {key === 'address'
                        ? <textarea className="asx-q-input" rows={2} maxLength={500} value={value} onChange={event => change(event.target.value)} />
                        : <input className="asx-q-input" value={value} maxLength={key === 'name' ? 200 : key === 'taxId' ? 30 : 50}
                            inputMode={key === 'taxId' || key === 'phone' ? 'numeric' : undefined} onChange={event => change(event.target.value)} />}
                    </label>
                  );
                })}
              </div>
            )}
            {(!question.kind || question.kind === 'choice') && (<>
              {question.options.length > 0 && (
                <div className="asx-q-options">
                  {question.options.map(option => chip(option, option, !typed[question.id]?.trim() && picked[question.id] === option, () => {
                    setPicked(state => ({ ...state, [question.id]: option })); setTyped(state => ({ ...state, [question.id]: '' }));
                  }))}
                </div>
              )}
              {question.allowText && (
                <input className="asx-q-input" value={typed[question.id] ?? ''} maxLength={200} aria-label={question.text}
                  placeholder={question.placeholder || (question.options.length ? tr("หรือพิมพ์เอง") : tr("พิมพ์คำตอบ"))}
                  onChange={event => setTyped(state => ({ ...state, [question.id]: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
              )}
            </>)}
          </fieldset>
        ))}
      </div>
      <div className="asx-rcard-actions">
        <button type="button" className="asx-pill-btn is-primary" onClick={submit} disabled={!ready || done}>
          {done ? <><Check size={14} />{tr("ส่งคำตอบแล้ว")}</> : <><Send size={14} />{tr("ส่งคำตอบ")}</>}
        </button>
      </div>
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
  /** A real answer, not sample data. */
  live?: boolean;
}) {
  return <LiveContext.Provider value={live}><CardBody {...props} /></LiveContext.Provider>;
}

function CardBody({ card, confirmState, confirmedPath, onConfirm, onCancel, onNavigate, onLineDue, onAnswer, answered, onRevise }: {
  card: ChatCard; confirmState?: ConfirmState; confirmedPath?: string; onConfirm: (card: ConfirmCard) => void; onCancel: (card: ConfirmCard) => void; onNavigate: (path: string) => void;
  onLineDue?: (action: LineDueAction, item: LineItem) => void; onAnswer?: (text: string) => void; answered?: boolean;
  onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void>;
}) {
  switch (card.kind) {
    case 'navigation': return <button type="button" className="asx-pill-btn asx-feature-link" onClick={() => onNavigate(card.path)}>{card.label}<ArrowUpRight size={14} aria-hidden="true" /></button>;
    case 'project': return <Project card={card} onNavigate={onNavigate} />;
    case 'document': return <Document card={card} onNavigate={onNavigate} />;
    case 'summary': return <Summary card={card} />;
    case 'money_chart': return <MoneyChart card={card} />;
    case 'confirm': return <Confirm key={card.id} card={card} state={confirmState ?? 'pending'} onConfirm={() => onConfirm(card)} confirmedPath={confirmedPath} onNavigate={onNavigate} onRevise={onRevise} />;
    case 'line': return <LineCard card={card.card} onDue={onLineDue} onOpen={onNavigate} />;
    case 'questions': return <Questions card={card} onAnswer={onAnswer} answered={answered} />;
    case 'official_link': return <OfficialLink card={card} />;
  }
}
