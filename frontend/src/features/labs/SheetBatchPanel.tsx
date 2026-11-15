import React from 'react';
import { Check, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { labOn } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi, type SheetBatchPreview, type SheetRowWrite } from '../../services/google';
import { useLabs } from '../../services/labs';
import './labs.css';

// The sheet under a paste of many records (owner, 2026-11-16): "ชีตควรที่จะอยู่ด้านล่างสุดเลย"; the cards come as cards and
// the sheet is shown only when the person asks ("ถ้าจะดูแบบเป็นชีตอ่ะก็ให้คนยูสเซอร์กดเองกดดูพรีวิวเอง"); the new rows follow
// one another ("ลำดับที่ 6 แล้วอันต่อไป ... 7 ... 8 ไม่ต้องเป็นลำดับ 6 ซ้ำกัน"); after saving, ดูในชีต opens the sheet with the
// new rows selected ("ให้มันรู้ว่าอะไรที่เป็นของใหม่ ... จุดโฟกัส"). Only for accounts with บันทึกลงชีต on.

type CardState = 'pending' | 'working' | 'done' | 'failed' | 'cancelled' | 'expired' | undefined;
const isMoney = (text: string | null) => !!text && /^-?[฿]?\s?[\d,]+(?:\.\d+)?$|^-$/.test(text.trim());

/** The link that opens the tab with rows first..last selected, from a written row's own link. */
export function rangeLink(url: string, first: number, last: number): string {
  return /range=A\d+:[A-Z]+\d+/.test(url) ? url.replace(/range=A\d+:([A-Z]+)\d+/, (_, column: string) => `range=A${first}:${column}${last}`) : url;
}

export function SheetBatchPanel({ ids, states }: { ids: string[]; states: Record<string, CardState> }) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = Boolean(account) && labOn(labs, 'sheetWrite');
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<SheetBatchPreview | null | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [writes, setWrites] = React.useState<{ proposalId: string; write: SheetRowWrite | null }[]>([]);
  const done = ids.filter(id => states[id] === 'done');
  const working = ids.some(id => states[id] === 'working');
  const pending = ids.filter(id => (states[id] ?? 'pending') === 'pending');
  const doneKey = done.join(',');

  React.useEffect(() => {
    if (!on || !account || !doneKey || working) return;
    let live = true;
    googleApi.writtenMany(account, doneKey.split(',')).then(list => { if (live) setWrites(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [on, account, doneKey, working]);

  if (!on) return null;
  const written = writes.flatMap(item => (item.write && item.write.status === 'written' ? [item.write] : []));
  const failed = writes.flatMap(item => (item.write?.status === 'failed' ? [item.write] : []));
  if (written.length || failed.length) {
    const tabs = new Map<string, { file: string; tab: string; rows: number[]; url: string }>();
    for (const write of written) {
      const key = `${write.file}›${write.tab}`;
      const entry = tabs.get(key) ?? { file: write.file, tab: write.tab, rows: [], url: write.url };
      entry.rows.push(write.row);
      tabs.set(key, entry);
    }
    return (
      <div className="lab lab-sb is-done" role="status" data-testid="sheet-batch-done">
        {[...tabs.values()].map(item => {
          const first = Math.min(...item.rows);
          const last = Math.max(...item.rows);
          return (
            <div key={`${item.file}-${item.tab}`} className="lab-sb-line">
              <img src="/brand/partners/google-sheets.png" alt="" width={18} height={18} />
              <p><Check size={14} aria-hidden="true" />{first === last ? tr("ลงชีต {0} › {1} แถว {2} แล้ว", item.file, item.tab, first)
                : tr("ลงชีต {0} › {1} แถว {2}–{3} แล้ว ({4} แถว)", item.file, item.tab, first, last, item.rows.length)}</p>
              {item.url && <a className="lab-btn is-primary" href={rangeLink(item.url, first, last)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("ดูในชีต")}</a>}
            </div>
          );
        })}
        {failed.length > 0 && <p className="lab-sr-note is-red">{tr("บันทึกในแอปแล้ว แต่ยังไม่ได้ลงชีต {0} รายการ: {1}", failed.length, tr(failed[0].error))}</p>}
        {written.length > 0 && <p className="lab-sb-hint">{tr("กดดูในชีต ระบบจะเปิดแท็บนั้นและเลือกแถวใหม่ไว้ให้เห็นทันที")}</p>}
      </div>
    );
  }
  if (!pending.length) return null;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && preview === undefined && account) {
      setLoading(true);
      googleApi.previewMany(account, pending).then(reply => setPreview(reply.preview)).catch(() => setPreview(null)).finally(() => setLoading(false));
    }
  };
  return (
    <div className="lab lab-sb" data-testid="sheet-batch">
      <button type="button" className="lab-sb-toggle" aria-expanded={open} onClick={toggle}>
        <img src="/brand/partners/google-sheets.png" alt="" width={18} height={18} />
        <span>{open ? tr("ซ่อนตัวอย่างในชีต") : tr("ดูตัวอย่างในชีต ({0} แถว)", pending.length)}</span>
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open && (loading ? <p className="lab-sb-hint"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{tr("กำลังอ่านชีต…")}</p>
        : preview ? preview.tabs.map(tab => (
          <div key={tab.tab} className="lab-sp" data-testid="sheet-batch-tab">
            <div className="lab-sp-head">
              <b>{tr("เพิ่ม {0} แถว · {1} › {2}", tab.rows.length, preview.file, tab.tab)}</b>
              <span className="lab-sp-chip is-waiting">{tr("ยังไม่ได้เขียน")}</span>
            </div>
            <div className="lab-sp-sheet">
              <table className="lab-sp-table">
                <thead>
                  <tr><th aria-label={tr("แถว")} />{tab.columns.map(column => <th key={column.index}>{column.letter} {column.header}{column.formula ? ` (${tr("สูตร")})` : ''}</th>)}</tr>
                </thead>
                <tbody>
                  {tab.before.map(item => (
                    <tr key={`old-${item.row}`} className="is-old"><th>{item.row}</th>{item.cells.map((cell, index) => <td key={index} className={isMoney(cell) ? 'is-num' : undefined}>{cell}</td>)}</tr>
                  ))}
                  {tab.rows.map(item => (
                    <tr key={item.proposalId} className="is-new"><th>{item.row}</th>{item.cells.map((cell, index) => {
                      const computed = cell === null ? item.computed?.[index] ?? null : null;
                      return <td key={index} className={cell === null ? `is-num is-auto${computed ? ' is-computed' : ''}` : isMoney(cell) ? 'is-num' : undefined}>
                        {cell !== null ? cell : computed ? <>{computed}<small>{tr("ตามสูตร")}</small></> : tr("คำนวณเอง")}
                      </td>;
                    })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )) : <p className="lab-sb-hint">{tr("ยังแสดงตัวอย่างไม่ได้ ตรวจว่าเชื่อมชีตและบันทึกแผนที่ชีตแล้ว ที่ ตั้งค่า › ชีตและภาษี")}</p>)}
    </div>
  );
}
