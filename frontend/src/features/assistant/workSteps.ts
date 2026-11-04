import React from 'react';
import { tr, T } from '../../i18n/tr';
import type { AssistantProgress } from '../../../../shared/assistantProgress';
import type { PreparedFile } from './voice';

// The live steps of a request to เลขากระรอก (owner, 2026-11-04: "อยากให้มีสถานะบอกว่ากำลังทำไรด้วย แบบของ Claude หรือ GPT ... เช่น
// ผมกำลังอ่าน excel หรือวิเคราะห์กำลังหาข้อมูล"). What the device did itself (reading a file, checking its figures) comes
// first, already done; then each step the server reports (shared/assistantProgress.ts). The finished list stays with the
// answer, folded.

export interface WorkStep { label: string; done: boolean; count: number }
export interface Work { steps: WorkStep[]; startedAt: number }
/** What the answer keeps: the steps and how long it took. */
export interface FinishedWork { steps: { label: string; count: number }[]; ms: number }

const TOOL_LABELS: Record<string, string> = {
  search_jobs: T("ค้นงานในบัญชี"), get_job: T("เปิดดูรายละเอียดงาน"), money_summary: T("รวมยอดรายรับรายจ่าย"),
  receivables: T("ดูเงินค้างรับ"), cash_forecast: T("คาดการณ์เงินสด"), week_plan: T("ดูงานที่ต้องทำสัปดาห์นี้"),
  search_documents: T("ค้นเอกสาร"), search_vault: T("ค้นในคลังเอกสาร"), wht_tracking: T("ตรวจใบ 50 ทวิ"),
  tax_estimate: T("ประมาณภาษี"), accounting_check: T("ตรวจหลักบัญชีและภาษี"), business_calc: T("คำนวณตัวเลข"),
  past_work: T("ดูงานเก่าที่คล้ายกัน"), account_data: T("ดูข้อมูลในบัญชี"), note_from_file: T("จดข้อมูลสำคัญจากไฟล์"),
  remember: T("จำสิ่งที่คุณบอก"), recall_memories: T("ทบทวนสิ่งที่จำไว้"), forget_memory: T("ลบสิ่งที่จำไว้"),
  ask_user: T("เตรียมคำถามที่ต้องถามคุณ"), feature_lookup: T("หาหน้าที่เกี่ยวข้อง"), navigate_to_feature: T("หาหน้าที่เกี่ยวข้อง"),
  official_link: T("หาลิงก์หน่วยงานทางการ"), collection_draft: T("ร่างข้อความทวงเงิน"), attach_file: T("เตรียมแนบไฟล์เข้าคลัง"),
  route_to_action: T("ส่งต่อไปเตรียมรายการ"), web_search: T("ค้นข้อมูลจากเว็บไซต์"),
  propose_add_job: T("เตรียมการ์ดเพิ่มงาน"), propose_edit_job: T("เตรียมการ์ดแก้งาน"), propose_delete_job: T("เตรียมการ์ดลบงาน"),
  propose_delete_all_jobs: T("เตรียมการ์ดลบงาน"), propose_record_payment: T("เตรียมการ์ดบันทึกรับเงิน"),
  propose_record_payments: T("เตรียมการ์ดบันทึกรับเงิน"), propose_add_expense: T("เตรียมการ์ดรายจ่าย"),
  propose_add_document: T("เตรียมเอกสาร"), propose_edit_document: T("เตรียมเอกสาร"), propose_delete_document: T("เตรียมการ์ดลบเอกสาร"),
  propose_add_goal: T("เตรียมการ์ดเป้าหมายออม"), propose_edit_goal: T("เตรียมการ์ดเป้าหมายออม"), propose_delete_goal: T("เตรียมการ์ดเป้าหมายออม"),
  propose_goal_transaction: T("เตรียมการ์ดเป้าหมายออม"),
};

/** The words for one step the server reported. */
export function progressLabel(event: AssistantProgress): string {
  if (event.kind === 'tool') return tr(TOOL_LABELS[event.name] ?? T("ดูข้อมูลในบัญชี"));
  if (event.round > 0) return event.route === 'action' ? tr("เตรียมรายการที่จะบันทึก") : tr("ตรวจคำตอบอีกครั้ง");
  if (event.web) return tr("ค้นข้อมูลจากเว็บไซต์ที่เชื่อถือได้");
  return event.files ? tr("อ่านไฟล์และวิเคราะห์") : tr("วิเคราะห์คำถาม");
}

/** What the device did before sending: each file read (and checked), then handing it over. A question with no file
 *  keeps the usual typing dots until the server reports its first step (the chat shows the steps from two on). */
export function startWork(files: PreparedFile[], now = Date.now()): Work {
  const steps: WorkStep[] = files.flatMap(file => {
    const read = file.kind === 'image' ? tr("ดูรูป {0}", file.name) : file.kind === 'pdf' ? tr("อ่านไฟล์ PDF {0}", file.name)
      : `${tr("อ่านไฟล์ {0}", file.name)}${file.summary ? ` · ${file.summary}` : ''}`;
    return [{ label: read, done: true, count: 1 }, ...(file.check ? [{ label: tr("ตรวจตัวเลขและเทียบยอดกับไฟล์"), done: true, count: 1 }] : [])];
  });
  steps.push({ label: files.length ? tr("ส่งให้เลขากระรอกวิเคราะห์") : tr("ส่งคำถามให้เลขากระรอก"), done: false, count: 1 });
  return { steps, startedAt: now };
}

/** One more step: the one before is done; the same step again counts up ("เตรียมการ์ดเพิ่มงาน (3)"). */
export function addProgress(work: Work, event: AssistantProgress): Work {
  const label = progressLabel(event);
  const last = work.steps.at(-1);
  if (last && last.label === label) return { ...work, steps: [...work.steps.slice(0, -1), { ...last, count: last.count + (event.kind === 'tool' ? 1 : 0) }] };
  return { ...work, steps: [...work.steps.map(step => ({ ...step, done: true })), { label, done: false, count: 1 }].slice(-12) };
}

export function finishWork(work: Work, now = Date.now()): FinishedWork {
  return { steps: work.steps.map(step => ({ label: step.label, count: step.count })), ms: Math.max(0, now - work.startedAt) };
}

/** The steps of the request in progress, kept in a ref too so a callback reads the latest. */
export function useWork() {
  const [work, setWork] = React.useState<Work | null>(null);
  const ref = React.useRef<Work | null>(null);
  const set = React.useCallback((next: Work | null) => { ref.current = next; setWork(next); }, []);
  return {
    work,
    begin: React.useCallback((files: PreparedFile[]) => set(startWork(files)), [set]),
    progress: React.useCallback((event: AssistantProgress) => { if (ref.current) set(addProgress(ref.current, event)); }, [set]),
    /** The finished steps for the answer (only when there was more than handing the question over), and clears them. */
    finish: React.useCallback((): FinishedWork | undefined => {
      const current = ref.current;
      set(null);
      return current && current.steps.length > 2 ? finishWork(current) : undefined;
    }, [set]),
    clear: React.useCallback(() => set(null), [set]),
  };
}

/** Seconds since a moment, ticking once a second while shown. */
export function useSeconds(since: number | null): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}
