import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { AdminAnalyticsAccount } from '../../../../shared/adminAnalytics';
import type { AccountFigures } from '../../../../shared/adminProfit';
import { usageCsv, usageRows, type UsageLevel, type UsageRow } from '../../../../shared/adminUsage';
import { uiSurface } from '../../components/ui/uiStyles';
import { secondary } from './groupUi';

// การใช้งานรายบัญชี (owner, 2026-10-25): every account with its app use beside its AI use, cost and money, a usage
// level, filters, and a CSV (shared/adminUsage.ts). Only what the two sources already hold; nothing is estimated.

type Copy = (th: string, en: string) => string;
const ROWS = 25;

const LEVEL_STYLE: Record<UsageLevel, string> = {
  heavy: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  medium: 'bg-brand-blue-bg text-brand-blue-acc',
  light: 'bg-brand-faint text-brand-muted',
  none: 'border border-brand-border text-brand-muted',
};

export default function AdminUsageTable({ accounts, figures, month, appDays, copy, money, count, unknown, locale }: {
  accounts?: AdminAnalyticsAccount[]; figures: AccountFigures[]; month: string; appDays: number; copy: Copy;
  money: (satang: number | null | undefined) => string; count: (n: number | null | undefined) => string; unknown: string; locale: string;
}) {
  const [filter, setFilter] = useState<'all' | 'heavy' | 'light' | 'none' | 'idlePro'>('all');
  const [sortBy, setSortBy] = useState<'ai' | 'messages' | 'days' | 'contribution'>('ai');
  const [all, setAll] = useState(false);
  const rows = useMemo(() => usageRows(accounts, figures), [accounts, figures]);
  const levelName: Record<UsageLevel, string> = { heavy: copy('ใช้หนัก', 'Heavy'), medium: copy('ปานกลาง', 'Medium'), light: copy('ใช้น้อย', 'Light'), none: copy('ไม่ได้ใช้ AI', 'No AI use') };
  const planName = (row: UsageRow) => {
    const plan = row.fig?.plan;
    if (plan) return ({ paid: copy('Pro (จ่ายเงิน)', 'Pro (paid)'), trial: copy('ทดลองใช้', 'Trial'), granted: copy('แอดมินให้สิทธิ์', 'Granted'), admin: copy('แอดมิน', 'Admin'), free: 'Free' })[plan];
    return row.who ? ({ pro: 'Pro', trial: copy('ทดลองใช้', 'Trial'), admin: copy('แอดมิน', 'Admin'), free: 'Free', expired: copy('หมดอายุ', 'Expired') } as Record<string, string>)[row.who.planStatus] ?? row.who.planStatus : '—';
  };
  const isPro = (row: UsageRow) => row.fig?.plan === 'paid' || row.who?.planStatus === 'pro';
  const shown = useMemo(() => {
    const list = rows.filter(row => filter === 'all' || (filter === 'heavy' ? row.level === 'heavy' : filter === 'light' ? row.level === 'light'
      : filter === 'none' ? row.level === 'none' : isPro(row) && row.level === 'none'));
    const key = (row: UsageRow) => sortBy === 'ai' ? row.fig?.aiUsd ?? 0 : sortBy === 'messages' ? row.fig?.messages ?? 0
      : sortBy === 'days' ? row.who?.activeDays ?? 0 : row.fig?.allocatedContribution ?? -Infinity;
    return list.sort((a, b) => key(b) - key(a) || (b.who?.pageViews ?? 0) - (a.who?.pageViews ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, sortBy]);

  const users = rows.filter(row => row.level !== 'none');
  const totalAi = users.reduce((sum, row) => sum + (row.fig?.aiUsd ?? 0), 0);
  const top = [...users].sort((a, b) => (b.fig?.aiUsd ?? 0) - (a.fig?.aiUsd ?? 0)).slice(0, Math.max(1, Math.ceil(users.length / 10)));
  const topShare = totalAi > 0 ? Math.round((top.reduce((sum, row) => sum + (row.fig?.aiUsd ?? 0), 0) / totalAi) * 100) : null;
  const idlePro = rows.filter(row => isPro(row) && row.level === 'none').length;
  const tally = (level: UsageLevel) => rows.filter(row => row.level === level).length;
  const lastSeen = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }) : '—';

  const download = () => {
    const blob = new Blob([usageCsv(shown, month, appDays)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `krarok-usage-${month}.csv`; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const filters: [typeof filter, string, number][] = [
    ['all', copy('ทุกบัญชี', 'All'), rows.length], ['heavy', levelName.heavy, tally('heavy')], ['light', levelName.light, tally('light')],
    ['none', levelName.none, tally('none')], ['idlePro', copy('Pro ที่ไม่ได้ใช้ AI', 'Pro without AI use'), idlePro],
  ];

  return <section className={`${uiSurface} overflow-hidden`} aria-labelledby="usage-accounts-title">
    <div className="space-y-3 border-b border-brand-border/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h3 id="usage-accounts-title" className="text-[14px] font-semibold">{copy('การใช้งานรายบัญชี', 'Usage by account')}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{copy(`ใช้แอป = ${appDays} วันล่าสุด · เลขาและเงิน = เดือนที่เลือก · ระดับการใช้ AI ดูจากสัดส่วนโทเคนที่ใช้ของรอบนี้ (หนัก 80% ขึ้นไป · ปานกลาง 30–79% · น้อยกว่านั้นคือใช้น้อย)`, `App use = last ${appDays} days · AI and money = the month chosen · AI level by the share of this cycle's tokens used (heavy 80%+ · medium 30–79% · below that light)`)}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="ui-input !w-auto" aria-label={copy('เรียงตาม', 'Sort by')} value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
            <option value="ai">{copy('ค่า AI สูงสุด', 'Highest AI cost')}</option>
            <option value="messages">{copy('ใช้เลขามากสุด', 'Most AI requests')}</option>
            <option value="days">{copy('เข้าใช้แอปบ่อยสุด', 'Most active in the app')}</option>
            <option value="contribution">{copy('กำไรต่อบัญชีสูงสุด', 'Highest contribution')}</option>
          </select>
          <button type="button" className={secondary} onClick={download} disabled={!shown.length}><Download size={15} aria-hidden="true" />{copy('ดาวน์โหลด CSV', 'Download CSV')}</button>
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-brand-muted">{copy(
        `ใช้ AI ${count(users.length)} จาก ${count(rows.length)} บัญชี · ใช้หนัก ${count(tally('heavy'))} · ปานกลาง ${count(tally('medium'))} · ใช้น้อย ${count(tally('light'))} · ${topShare === null ? 'ยังไม่มีค่า AI' : `10% แรกใช้ ${topShare}% ของค่า AI ทั้งหมด`} · Pro ที่จ่ายแต่ไม่ได้ใช้ AI ${count(idlePro)} คน`,
        `${count(users.length)} of ${count(rows.length)} accounts used AI · heavy ${count(tally('heavy'))} · medium ${count(tally('medium'))} · light ${count(tally('light'))} · ${topShare === null ? 'no AI cost yet' : `the top 10% used ${topShare}% of the AI cost`} · paying Pro without AI use ${count(idlePro)}`)}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={copy('แสดงเฉพาะ', 'Show only')}>
        {filters.map(([key, label, n]) => <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => { setFilter(key); setAll(false); }}
          className={`rounded-full px-3 py-1 text-[12px] font-medium leading-relaxed transition-colors ${filter === key ? 'bg-brand-blue-acc text-white' : 'border border-brand-border text-brand-muted hover:text-brand-text'}`}>{label} {count(n)}</button>)}
      </div>
    </div>
    {shown.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-[13px]">
      <thead><tr className="border-b border-brand-border/60 text-left text-[11px] text-brand-muted">
        {[copy('บัญชี', 'Account'), copy('สถานะ', 'Plan'), copy(`ใช้แอป (${appDays} วัน)`, `App (${appDays} days)`), copy('ระดับการใช้ AI', 'AI level'), copy('ข้อความเลขา (Gemini / Claude)', 'AI requests (Gemini / Claude)'), copy('โควตาที่ใช้', 'Quota used'), copy('ค่า AI', 'AI cost'), copy('รับชำระ', 'Paid'), copy('กำไรต่อบัญชี', 'Contribution')].map(head => <th key={head} scope="col" className="px-4 py-2.5 font-medium">{head}</th>)}
      </tr></thead>
      <tbody>{(all ? shown : shown.slice(0, ROWS)).map(row => {
        const fig = row.fig;
        return <tr key={row.userId} className="border-b border-brand-border/40 last:border-0">
          <td className="px-4 py-2.5"><p className="font-medium">{row.who?.displayName ?? copy('บัญชี', 'Account')}</p><p className="font-mono text-[11px] text-brand-muted">{row.who?.publicId ?? row.userId.slice(0, 8)}</p></td>
          <td className="px-4 py-2.5 text-brand-muted">{planName(row)}</td>
          <td className="px-4 py-2.5 tabular-nums">{row.who ? <>{copy(`${count(row.who.activeDays)} วัน · ${count(row.who.pageViews)} หน้า`, `${count(row.who.activeDays)} days · ${count(row.who.pageViews)} pages`)}<p className="text-[11px] text-brand-muted">{copy('ล่าสุด', 'Last')} {lastSeen(row.who.lastSeenAt)}</p></> : unknown}</td>
          <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[row.level]}`}>{levelName[row.level]}</span></td>
          <td className="px-4 py-2.5 tabular-nums">{count(fig?.messages ?? 0)} <span className="text-brand-muted">({count(fig?.geminiMessages ?? 0)} / {count(fig?.claudeMessages ?? 0)})</span></td>
          <td className="px-4 py-2.5 tabular-nums">{row.quota === null ? '—' : `${row.quota}%`}</td>
          <td className="px-4 py-2.5 tabular-nums">{money(fig ? fig.ai : 0)}</td>
          <td className="px-4 py-2.5 tabular-nums">{money(fig?.cashRevenue ?? 0)}</td>
          <td className={`px-4 py-2.5 tabular-nums ${(fig?.allocatedContribution ?? 0) < 0 ? 'text-red-600 dark:text-red-300' : ''}`}>{fig?.plan === 'paid' ? money(fig.allocatedContribution) : '—'}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="p-5 text-sm text-brand-muted">{copy('ไม่มีบัญชีในกลุ่มนี้', 'No accounts in this group')}</p>}
    {shown.length > ROWS && <div className="border-t border-brand-border/60 p-3 text-center"><button type="button" className="text-xs font-semibold text-brand-blue-acc" onClick={() => setAll(value => !value)}>
      {all ? copy('แสดงน้อยลง', 'Show fewer') : copy(`แสดงทั้งหมด ${shown.length} บัญชี`, `Show all ${shown.length} accounts`)}</button></div>}
  </section>;
}
