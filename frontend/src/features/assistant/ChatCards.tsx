import React from 'react';
import { AlertCircle, ArrowUpRight, BarChart3, Briefcase, Check, CheckCircle2, FileText, ListChecks, Loader2, Pencil, Send, X } from 'lucide-react';
import { tr, T } from '../../i18n/tr';
import { partyAnswer, paymentAnswer, thaiDateAnswer, type PartyValues } from '../../../../shared/askQuestions';
import type { ChatCard, ConfirmCard, DocumentCard, MoneyChartCard, ProjectCard, QuestionsCard, SummaryCard } from './assistantMock';
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
      <Rows rows={[{ label: tr("รายรับรวม"), value: formatTHB(card.totals.income), tone: 'income' }, { label: tr("รายจ่ายรวม"), value: formatTHB(card.totals.expense), tone: 'expense' }, { label: tr("คงเหลือ"), value: formatTHB(card.totals.net) }]} />
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

function Confirm({ card, state, onConfirm, onCancel, confirmedPath, onNavigate, onRevise }: { card: ConfirmCard; state: ConfirmState; onConfirm: () => void; onCancel: () => void; confirmedPath?: string; onNavigate: (path: string) => void; onRevise?: (card: ConfirmCard, edits: Record<string, string>) => Promise<void> }) {
  const live = React.useContext(LiveContext);
  // Change fields right on the card before confirming (owner, 2026-10-24); the card is prepared again with them.
  const [editing, setEditing] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fields = card.edit ?? [];
  const canEdit = live && Boolean(onRevise) && fields.length > 0 && state === 'pending';
  const box = React.useRef<HTMLDivElement>(null);
  // The card grows while editing: bring all of it above the message box, so its buttons are never under the dock.
  React.useEffect(() => { if (editing) requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }, [editing]);
  const startEdit = () => { setValues(Object.fromEntries(fields.map(field => [field.field, field.value]))); setProblem(null); setEditing(true); };
  const saveEdit = async () => {
    const changed = Object.fromEntries(fields.filter(field => (values[field.field] ?? '') !== field.value).map(field => [field.field, values[field.field] ?? '']));
    if (!Object.keys(changed).length) { setEditing(false); return; }
    setSaving(true); setProblem(null);
    try { await onRevise!(card, changed); setEditing(false); }
    catch (error) { setProblem((error as Error)?.message || tr("แก้รายการนี้ไม่สำเร็จ")); }
    finally { setSaving(false); }
  };
  return (
    <div ref={box} className={`asx-rcard is-confirm is-${state}${editing ? ' is-editing' : ''}`}
      // Focusing a field scrolls only that field into view (a phone keyboard, a tap): bring the whole card back so
      // ใช้ค่านี้ / ไม่แก้แล้ว stay above the message box.
      onFocus={editing ? () => requestAnimationFrame(() => box.current?.scrollIntoView({ block: 'nearest' })) : undefined}>
      <Head icon={CheckCircle2} title={card.title} />
      {editing ? (
        <div className="asx-edit-list">
          {fields.map(field => (
            <label key={field.field} className="asx-edit-row">
              <span>{field.label}</span>
              {field.type === 'choice' ? (
                <select value={values[field.field] ?? ''} onChange={event => setValues(state => ({ ...state, [field.field]: event.target.value }))} disabled={saving}>
                  {(field.options ?? []).map(option => <option key={option} value={option}>{choiceLabel(option, field.field)}</option>)}
                </select>
              ) : (
                <input type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'money' ? 'decimal' : undefined} value={values[field.field] ?? ''} disabled={saving} maxLength={200}
                  onChange={event => setValues(state => ({ ...state, [field.field]: event.target.value }))}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void saveEdit(); } }} />
              )}
            </label>
          ))}
          {problem && <p className="asx-edit-problem" role="alert"><AlertCircle size={14} />{problem}</p>}
        </div>
      ) : <Rows rows={card.changes} />}
      {editing ? (
        <div className="asx-rcard-actions">
          <button type="button" className="asx-pill-btn" onClick={() => { setEditing(false); setProblem(null); }} disabled={saving}>{tr("ไม่แก้แล้ว")}</button>
          <button type="button" className="asx-pill-btn is-primary" onClick={() => void saveEdit()} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}{tr("ใช้ค่านี้")}
          </button>
        </div>
      ) : state === 'pending' || state === 'working' ? (
        <div className="asx-rcard-actions">
          {canEdit && <button type="button" className="asx-pill-btn asx-edit-btn" onClick={startEdit}><Pencil size={14} />{tr("แก้ไข")}</button>}
          <button type="button" className="asx-pill-btn" onClick={onCancel} disabled={state === 'working'}>{tr("ยกเลิก")}</button>
          <button type="button" className="asx-pill-btn is-primary" onClick={onConfirm} disabled={state === 'working'}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" />}{tr("ยืนยัน")}
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
    case 'confirm': return <Confirm card={card} state={confirmState ?? 'pending'} onConfirm={() => onConfirm(card)} onCancel={() => onCancel(card)} confirmedPath={confirmedPath} onNavigate={onNavigate} onRevise={onRevise} />;
    case 'line': return <LineCard card={card.card} onDue={onLineDue} onOpen={onNavigate} />;
    case 'questions': return <Questions card={card} onAnswer={onAnswer} answered={answered} />;
  }
}
