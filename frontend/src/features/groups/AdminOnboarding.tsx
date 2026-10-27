import React from 'react';
import { uiSurface } from '../../components/ui/uiStyles';
import { GOALS, OCCUPATIONS, WORK_TYPES, type OnboardingAnalytics, type OnboardingSegment } from '../../../../shared/onboarding';

// Welcome Onboarding V1 for the admin (owner brief, 2026-10-28): who signs up (work type, occupation), what they want
// from Krarok, and what each group really does: made a job, a document, an expense, asked เลขา, came back, bought Pro.
// Groups only, never people; the counts come from each account's own records (how many, not what they hold).

const EN: Record<string, string> = {
  freelance: 'Freelance / independent', employee: 'Full-time employee', student: 'Student', business_owner: 'Business owner / agency', other: 'Other',
  content_creator: 'Content creator', video_graphic: 'Video editing / graphics', developer_digital: 'Developer / digital work', marketing: 'Marketing / ads',
  photo_video: 'Photo / video', teacher_coach: 'Teacher / tutor / coach', trade_owner: 'Trade / shop owner',
  cashflow_overview: 'Income, spending and cash flow', receivables: 'Money owed by clients', projects: 'Jobs and projects', documents: 'Quotations and documents',
  exploring: 'Not sure, trying it first',
};
const label = (list: readonly { id: string; label: string }[], id: string, th: boolean) => (th ? list.find(item => item.id === id)?.label.replace(' (โปรดระบุ)', '') : EN[id]) ?? id;
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

type Copy = (th: string, en: string) => string;
const COLUMNS = (copy: Copy) => [
  { key: 'returned', title: copy('กลับมาใช้', 'Came back') },
  { key: 'project_created', title: copy('สร้างงาน', 'Made a job') },
  { key: 'document_created', title: copy('ออกเอกสาร', 'Made a document') },
  { key: 'expense_created', title: copy('บันทึกรายจ่าย', 'Logged an expense') },
  { key: 'ai_message_sent', title: copy('ใช้เลขา', 'Asked เลขา') },
  { key: 'pro_subscription_activated', title: copy('สมัคร Pro', 'Bought Pro') },
] as const;

function SegmentTable({ title, note, rows, list, total, copy, th }: { title: string; note: string; rows: OnboardingSegment[]; list: readonly { id: string; label: string }[]; total: number; copy: Copy; th: boolean }) {
  const columns = COLUMNS(copy);
  const sorted = [...rows].sort((a, b) => b.accounts - a.accounts);
  return (
    <section className={`${uiSurface} overflow-hidden`} aria-label={title}>
      <div className="border-b border-brand-border/60 px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold leading-[1.45]">{title}</h2>
        <p className="mt-0.5 text-xs leading-[1.55] text-brand-muted">{note}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-brand-bg/70 text-xs text-brand-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">{copy('กลุ่ม', 'Group')}</th>
              <th className="px-3 py-3 text-right font-semibold">{copy('บัญชี', 'Accounts')}</th>
              {columns.map(column => <th key={column.key} className="px-3 py-3 text-right font-semibold">{column.title}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/60">
            {sorted.map(row => (
              <tr key={row.id}>
                <td className="px-5 py-3 font-medium leading-[1.45]">{label(list, row.id, th)}</td>
                <td className="px-3 py-3 text-right tabular-nums"><span className="font-semibold">{row.accounts}</span><span className="ml-1.5 text-xs text-brand-muted">{share(row.accounts, total)}</span></td>
                {columns.map(column => <td key={column.key} className="px-3 py-3 text-right tabular-nums">{row.accounts ? share(row[column.key], row.accounts) : '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentCards({ title, note, rows, list, total, copy, th }: { title: string; note: string; rows: OnboardingSegment[]; list: readonly { id: string; label: string }[]; total: number; copy: Copy; th: boolean }) {
  const columns = COLUMNS(copy);
  return (
    <section aria-label={title} className="space-y-2">
      <div className="px-1"><h2 className="text-[15px] font-semibold leading-[1.45]">{title}</h2><p className="mt-1 text-xs leading-[1.55] text-brand-muted">{note}</p></div>
      {[...rows].sort((a, b) => b.accounts - a.accounts).map(row => (
        <article key={row.id} className={`${uiSurface} p-4`}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[14.5px] font-semibold leading-[1.45]">{label(list, row.id, th)}</p>
            <p className="shrink-0 tabular-nums"><span className="text-[15px] font-semibold">{row.accounts}</span><span className="ml-1 text-xs text-brand-muted">{copy('บัญชี', 'accounts')} · {share(row.accounts, total)}</span></p>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
            {columns.map(column => (
              <div key={column.key} className="min-w-0"><dt className="truncate text-[11.5px] leading-[1.45] text-brand-muted">{column.title}</dt><dd className="text-[14px] font-semibold tabular-nums leading-[1.45]">{row.accounts ? share(row[column.key], row.accounts) : '–'}</dd></div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}

export default function AdminOnboarding({ data, language, mobile = false }: { data: OnboardingAnalytics | undefined; language: 'th' | 'en'; mobile?: boolean }) {
  const th = language === 'th';
  const copy: Copy = (thText, enText) => (th ? thText : enText);
  if (!data) return <section className={`${uiSurface} p-6 text-sm text-brand-muted`}>{copy('ยังไม่มีข้อมูลแบบสอบถาม', 'No questionnaire data yet')}</section>;
  const answered = data.completed + data.skipped;
  const Segments = mobile ? SegmentCards : SegmentTable;
  const kpis = [
    { label: copy('ตอบครบ', 'Completed'), value: data.completed, detail: share(data.completed, data.eligible) },
    { label: copy('กดข้าม', 'Skipped'), value: data.skipped, detail: share(data.skipped, data.eligible) },
    { label: copy('ยังไม่ได้ตอบ', 'Not answered yet'), value: data.pending, detail: share(data.pending, data.eligible) },
    { label: copy('บัญชีใหม่ที่ถามได้', 'New accounts asked'), value: data.eligible, detail: copy('สมัครตั้งแต่ 28 ต.ค. 2569', 'Signed up since 28 Oct 2026') },
  ];
  const others = [
    { title: copy('รูปแบบงานที่พิมพ์เอง', 'Typed work types'), rows: data.otherWorkTypes },
    { title: copy('สายงานที่พิมพ์เอง', 'Typed occupations'), rows: data.otherOccupations },
  ];
  const note = copy('กลับมาใช้ = ใช้แอป 2 วันขึ้นไปในช่วงที่เลือก · อื่น ๆ นับทั้งหมดที่เคยทำ', 'Came back = used the app on 2+ days in the period · the rest count everything so far');
  return (
    <div className="space-y-4" data-testid="admin-onboarding">
      <div className={`grid gap-3 ${mobile ? 'grid-cols-2' : 'sm:grid-cols-4'}`}>
        {kpis.map(kpi => (
          <article key={kpi.label} className={`${uiSurface} min-w-0 p-4`}>
            <p className="text-xs leading-[1.45] text-brand-muted">{kpi.label}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums leading-[1.45]">{kpi.value.toLocaleString(th ? 'th-TH' : 'en-US')}</p>
            <p className="text-[11.5px] leading-[1.45] text-brand-muted">{kpi.detail}</p>
          </article>
        ))}
      </div>
      <Segments title={copy('รูปแบบการทำงาน', 'Work type')} note={`${copy('จากคนที่ตอบ', 'Of those who answered')} ${answered.toLocaleString()} ${copy('บัญชี', 'accounts')} · ${note}`}
        rows={data.workTypes} list={WORK_TYPES} total={answered} copy={copy} th={th} />
      <Segments title={copy('สายงาน', 'Occupation')} note={`${copy('เลือกได้หลายข้อ', 'Several per account')} · ${note}`} rows={data.occupations} list={OCCUPATIONS} total={answered} copy={copy} th={th} />
      <Segments title={copy('อยากให้ Krarok ช่วยเรื่องไหน', 'What they want from Krarok')} note={`${copy('เลือกได้หลายข้อ', 'Several per account')} · ${note}`} rows={data.goals} list={GOALS} total={answered} copy={copy} th={th} />
      <div className={`grid gap-3 ${mobile ? '' : 'sm:grid-cols-2'}`}>
        {others.map(group => (
          <section key={group.title} className={`${uiSurface} p-5`} aria-label={group.title}>
            <h2 className="text-[15px] font-semibold leading-[1.45]">{group.title}</h2>
            {group.rows.length ? (
              <ul className="mt-3 divide-y divide-brand-border/60 text-sm">
                {group.rows.map(row => <li key={row.text} className="flex items-baseline justify-between gap-3 py-2"><span className="min-w-0 break-words leading-[1.5]">{row.text}</span><span className="shrink-0 tabular-nums text-brand-muted">{row.accounts}</span></li>)}
              </ul>
            ) : <p className="mt-2 text-sm leading-[1.55] text-brand-muted">{copy('ยังไม่มี', 'None yet')}</p>}
          </section>
        ))}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-brand-muted">{copy('นับจากข้อมูลของแต่ละบัญชีเป็นจำนวนเท่านั้น ไม่เปิดดูเนื้อหางาน เอกสาร หรือรายจ่ายของผู้ใช้ และแสดงเป็นกลุ่ม ไม่แสดงรายบุคคล', 'Counted from each account’s records as numbers only; nobody’s jobs, documents or expenses are opened, and only groups are shown.')}</p>
    </div>
  );
}
