import React, { useMemo } from 'react';
import { Job } from '../../../../shared/types';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import { Users } from 'lucide-react';

interface ClientsTabProps {
  jobs: Job[];
  onSwitchTab: (id: string) => void;
}

interface ClientRow {
  name: string;
  jobCount: number;
  totalRevenue: number;
  totalPending: number;
  latestJobDate: string | null;
}

export default function ClientsTab({ jobs, onSwitchTab }: ClientsTabProps) {
  const clientRows = useMemo<ClientRow[]>(() => {
    const byClient = new Map<string, ClientRow>();
    jobs.forEach(job => {
      const name = (job.client || '').trim() || 'ไม่ระบุชื่อลูกค้า';
      const jobDate = job.postDate || job.startDate || null;
      const existing = byClient.get(name);
      if (existing) {
        existing.jobCount += 1;
        existing.totalRevenue += job.value;
        existing.totalPending += job.pending;
        if (jobDate && (!existing.latestJobDate || jobDate > existing.latestJobDate)) {
          existing.latestJobDate = jobDate;
        }
      } else {
        byClient.set(name, {
          name,
          jobCount: 1,
          totalRevenue: job.value,
          totalPending: job.pending,
          latestJobDate: jobDate,
        });
      }
    });
    return Array.from(byClient.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [jobs]);

  if (clientRows.length === 0) {
    return (
      <div className="page-content">
        <div className="bg-brand-white border border-brand-border rounded-3xl p-10 text-center flex flex-col items-center gap-3">
          <Mascot mood="wave" size={72} />
          <h3 className="text-sm font-black text-brand-text">ยังไม่มีลูกค้าในระบบ</h3>
          <p className="text-xs text-brand-muted max-w-sm">ลูกค้าจะปรากฏที่นี่โดยอัตโนมัติทันทีที่คุณบันทึกงานพร้อมชื่อลูกค้า</p>
          <button
            type="button"
            onClick={() => onSwitchTab('jobs')}
            className="mt-2 px-5 py-2.5 bg-[#E65F2B] hover:bg-[#D98324] text-white text-xs font-black rounded-2xl transition-colors cursor-pointer"
          >
            + บันทึกงานใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E65F2B]/10">
          <Users className="h-4.5 w-4.5 text-[#E65F2B]" />
        </div>
        <div>
          <h2 className="text-lg font-black text-brand-text">ลูกค้า</h2>
          <p className="text-xs text-brand-muted">สรุปรายชื่อลูกค้า รายได้รวม และเงินค้างรับต่อราย โดยรวมจากงานที่บันทึกไว้</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-brand-border bg-brand-faint/60 text-[10px] font-black uppercase tracking-wide text-brand-muted">
                <th className="px-5 py-3">ชื่อ</th>
                <th className="px-5 py-3">จำนวนงาน</th>
                <th className="px-5 py-3">รายได้รวม</th>
                <th className="px-5 py-3">งานล่าสุด</th>
                <th className="px-5 py-3 text-right">เงินค้างรับ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/60">
              {clientRows.map(row => (
                <tr key={row.name} className="hover:bg-brand-faint/40 transition-colors">
                  <td className="px-5 py-4 font-bold text-brand-text">{row.name}</td>
                  <td className="px-5 py-4 text-brand-muted">{row.jobCount}</td>
                  <td className="px-5 py-4 font-mono font-bold text-brand-text">{formatCurrency(row.totalRevenue)}</td>
                  <td className="px-5 py-4 text-brand-muted">
                    {row.latestJobDate ? safeFormatThaiDate(row.latestJobDate) : '—'}
                  </td>
                  <td className={`px-5 py-4 text-right font-mono font-bold ${row.totalPending > 0 ? 'text-[#A63F1B]' : 'text-brand-muted'}`}>
                    {formatCurrency(row.totalPending)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
