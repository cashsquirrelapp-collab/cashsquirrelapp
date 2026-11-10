import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Mail, MessageCircle, Search, Sparkles } from 'lucide-react';
import type { AdminAnalyticsAccount, AnalyticsRange } from '../../../../shared/adminAnalytics';
import { regularAccounts, regularEmails, regularType, type RegularExtra, type RegularFilter } from '../../../../shared/adminRegulars';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { KsIcon } from '../mobile/icons';
import { groupApi } from '../../services/groups';
import { featureLabels, planLabels } from './adminLabels';
import './adminRegulars.css';

// ผู้ใช้ประจำ (owner, 2026-11-10; shared/adminRegulars.ts): the accounts that came back on more than one day, most days first,
// with their email (copy one, or every email of the list for an email's BCC), what they said they do when they signed up,
// the pages they open most, เลขา requests and LINE. The owner only: the server refuses everyone else.

type Copy = (th: string, en: string) => string;
const MIN_DAYS = [2, 5, 10] as const;

export default function AdminRegulars({ userId, range, accounts, revision = 0, language, mobile = false }: {
  userId: string; range: AnalyticsRange; accounts: AdminAnalyticsAccount[] | undefined; revision?: number; language: 'th' | 'en'; mobile?: boolean;
}) {
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const lang: 0 | 1 = language === 'th' ? 0 : 1;
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const [extras, setExtras] = useState<RegularExtra[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RegularFilter>({ minDays: 2, plan: 'all', query: '' });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    groupApi.regulars(userId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) setExtras(result.accounts); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [userId, range, revision]);

  const list = useMemo(() => (accounts && extras ? regularAccounts(accounts, extras, filter) : []), [accounts, extras, filter]);
  const emails = regularEmails(list);
  const when = (value: string | null) => (value ? new Date(value).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }) : '—');
  const copyText = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(current => (current === key ? null : current)), 1800); }
    catch { setCopied(null); }
  };
  const set = (patch: Partial<RegularFilter>) => setFilter(current => ({ ...current, ...patch }));
  const loading = !error && (!accounts || !extras);
  const failed = error && <div role="alert" className={mobile ? 'ksm-empty ksm-admin-error' : 'rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300'}>{error}</div>;
  const note = copy('วันใช้งานนับจากเบราว์เซอร์ที่อนุญาตสถิติการใช้งาน · ส่งอีเมลข่าวสารหรือโปรโมชัน ควรบอกวิธีขอเลิกรับไว้ท้ายอีเมลทุกครั้ง',
    'Days are counted from browsers that allow usage statistics · news or promotion emails should always say how to stop receiving them.');

  const uses = (item: (typeof list)[number]) => (
    <span className="arg-uses">
      {item.topFeatures.slice(0, 3).map(feature => <span key={feature.key} className="arg-chip">{featureLabels[feature.key]?.[lang] ?? feature.key}</span>)}
      {(item.extra?.aiRequests ?? 0) > 0 && <span className="arg-chip is-ai"><Sparkles size={12} aria-hidden="true" />{copy(`เลขา ${item.extra!.aiRequests} ครั้ง`, `Assistant ×${item.extra!.aiRequests}`)}</span>}
      {item.extra?.lineLinked && <span className="arg-chip is-line"><MessageCircle size={12} aria-hidden="true" />LINE</span>}
      {!item.topFeatures.length && !(item.extra?.aiRequests) && !item.extra?.lineLinked && <span className="arg-muted">—</span>}
    </span>
  );
  const emailCell = (item: (typeof list)[number]) => item.extra?.email ? (
    <span className="arg-email">
      <a href={`mailto:${item.extra.email}`} className="arg-email-text" title={item.extra.email}>{item.extra.email}</a>
      <button type="button" className="arg-icon" onClick={event => { event.stopPropagation(); void copyText(item.userId, item.extra!.email!); }}
        aria-label={copy(`คัดลอกอีเมลของ ${item.displayName}`, `Copy ${item.displayName}'s email`)} data-testid="regular-copy-email">
        {copied === item.userId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
    </span>
  ) : <span className="arg-muted">{copy('ไม่มีอีเมล', 'No email')}</span>;

  const controls = (
    <div className={mobile ? 'arg-controls is-mobile' : 'arg-controls'}>
      <div className="arg-chips" role="group" aria-label={copy('กลับมาใช้อย่างน้อย', 'Came back at least')}>
        {MIN_DAYS.map(days => (
          <button key={days} type="button" aria-pressed={filter.minDays === days} className="arg-pick" onClick={() => set({ minDays: days })} data-testid={`regular-min-${days}`}>
            {copy(`${days} วันขึ้นไป`, `${days}+ days`)}
          </button>
        ))}
      </div>
      <div className="arg-chips" role="group" aria-label={copy('แพ็กเกจ', 'Plan')}>
        {([['all', 'ทุกคน', 'Everyone'], ['paying', 'Pro', 'Pro'], ['free', 'ยังไม่จ่าย', 'Not paying']] as const).map(([key, th, en]) => (
          <button key={key} type="button" aria-pressed={filter.plan === key} className="arg-pick" onClick={() => set({ plan: key })}>{copy(th, en)}</button>
        ))}
      </div>
      <button type="button" className="ui-button ui-button-secondary arg-copy-all" disabled={!emails.length} onClick={() => void copyText('all', emails.join(', '))} data-testid="regular-copy-all">
        {copied === 'all' ? <Check size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}
        {copied === 'all' ? copy(`คัดลอก ${emails.length} อีเมลแล้ว`, `Copied ${emails.length} emails`) : copy(`คัดลอกอีเมลทั้งหมด (${emails.length})`, `Copy all emails (${emails.length})`)}
      </button>
    </div>
  );

  if (mobile) {
    return (
      <div className="arg is-mobile">
        {failed}
        {loading && <SkeletonBlock className="mt-3 h-48 w-full rounded-2xl" />}
        {!loading && !error && (
          <>
            <div className="ksm-search">
              <KsIcon name="search" />
              <input type="text" inputMode="search" autoComplete="off" value={filter.query} onChange={event => set({ query: event.target.value })} placeholder={copy('ค้นหาชื่อ อีเมล หรืออาชีพ', 'Search name, email or work')} aria-label={copy('ค้นหาผู้ใช้ประจำ', 'Search regulars')} />
            </div>
            {controls}
            {list.length ? (
              <div className="arg-cards">
                {list.map((item, index) => (
                  <article key={item.userId} className="ksm-panel arg-card" data-testid="regular-row">
                    <div className="arg-card-head">
                      <span className="arg-rank">{index + 1}</span>
                      <div className="arg-grow"><b>{item.displayName}</b><small>{item.publicId} · {planLabels[item.planStatus][lang]}</small></div>
                      <span className="arg-days"><strong>{copy(`${item.activeDays} วัน`, `${item.activeDays} d`)}</strong><small>{copy(`ใน ${range} วัน`, `in ${range} d`)}</small></span>
                    </div>
                    {emailCell(item)}
                    <p className="arg-type">{regularType(item.extra) ?? copy('ยังไม่ได้ตอบคำถามตอนสมัคร', 'No sign-up answers')}</p>
                    {uses(item)}
                    <p className="arg-muted">{copy(`ล่าสุด ${when(item.lastSeenAt)} · เปิด ${item.pageViews.toLocaleString(locale)} หน้า`, `Last ${when(item.lastSeenAt)} · ${item.pageViews} pages`)}</p>
                  </article>
                ))}
              </div>
            ) : <div className="ksm-empty"><h3>{copy('ยังไม่มีคนที่กลับมาใช้ตามเงื่อนไขนี้', 'Nobody came back this often yet')}</h3></div>}
            <p className="ksm-micro">{note}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="arg space-y-4">
      {failed}
      {loading && <div className={`${uiSurface} p-5`}><SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="mt-6 h-56 w-full" /></div>}
      {!loading && !error && (
        <section className={`${uiSurface} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 p-5">
            <div>
              <h2 className="text-[15px] font-semibold">{copy('ผู้ใช้ประจำ', 'Regulars')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy(`คนที่กลับมาใช้ซ้ำใน ${range} วันล่าสุด ${list.length.toLocaleString(locale)} คน · เรียงจากวันที่ใช้มากที่สุด`, `${list.length} people came back in the last ${range} days · most days first`)}</p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
              <input className="ui-input !pl-9" value={filter.query} onChange={event => set({ query: event.target.value })} placeholder={copy('ค้นหาชื่อ อีเมล หรืออาชีพ', 'Search name, email or work')} aria-label={copy('ค้นหาผู้ใช้ประจำ', 'Search regulars')} data-testid="regular-search" />
            </label>
          </div>
          <div className="border-b border-brand-border/60 px-5 py-3">{controls}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed text-left text-sm" data-testid="regular-table">
              <thead className="bg-brand-bg/70 text-xs text-brand-muted">
                <tr>
                  <th className="w-[4%] px-5 py-3 font-semibold">#</th>
                  <th className="w-[16%] px-3 py-3 font-semibold">{copy('ผู้ใช้', 'Person')}</th>
                  <th className="w-[24%] px-3 py-3 font-semibold">{copy('อีเมล', 'Email')}</th>
                  <th className="w-[9%] px-3 py-3 text-right font-semibold">{copy('วันที่ใช้', 'Days used')}</th>
                  <th className="w-[8%] px-3 py-3 font-semibold">{copy('ล่าสุด', 'Last seen')}</th>
                  <th className="w-[18%] px-3 py-3 font-semibold">{copy('เป็นใคร (ตอบตอนสมัคร)', 'Who (from sign-up)')}</th>
                  <th className="w-[21%] px-5 py-3 font-semibold">{copy('ใช้อะไรมากที่สุด', 'Uses most')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item, index) => (
                  <tr key={item.userId} className="border-t border-brand-border/60 align-top" data-testid="regular-row">
                    <td className="px-5 py-3 tabular-nums text-brand-muted">{index + 1}</td>
                    <td className="px-3 py-3"><span className="block truncate font-medium text-brand-text">{item.displayName}</span><span className="mt-0.5 block truncate text-[11px] text-brand-muted">{item.publicId} · {planLabels[item.planStatus][lang]}</span></td>
                    <td className="px-3 py-3">{emailCell(item)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-brand-muted"><b className="font-semibold text-brand-text">{item.activeDays}</b>/{range}<span className="mt-0.5 block text-[11px]">{copy(`${item.pageViews.toLocaleString(locale)} หน้า`, `${item.pageViews} pages`)}</span></td>
                    <td className="px-3 py-3 text-brand-muted">{when(item.lastSeenAt)}</td>
                    <td className="px-3 py-3"><span className="arg-type">{regularType(item.extra) ?? <span className="arg-muted">{copy('ยังไม่ได้ตอบ', 'Not answered')}</span>}</span></td>
                    <td className="px-5 py-3">{uses(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <p className="px-5 py-8 text-center text-sm text-brand-muted">{copy('ยังไม่มีคนที่กลับมาใช้ตามเงื่อนไขนี้', 'Nobody came back this often yet')}</p>}
          </div>
          <p className="border-t border-brand-border/60 px-5 py-3 text-[11px] leading-relaxed text-brand-muted">{note}</p>
        </section>
      )}
    </div>
  );
}
