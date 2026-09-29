import React, { useMemo } from 'react';
import { Job } from '../../../../shared/types';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';

interface ClientsTabProps {
  jobs: Job[];
  onSwitchTab: (id: string) => void;
}

interface ClientRow {
  name: string;
  type: string;
  jobCount: number;
  totalRevenue: number;
  totalPending: number;
  latestJobDate: string | null;
}

export default function ClientsTab({ jobs, onSwitchTab }: ClientsTabProps) {
  const clientRows = useMemo<ClientRow[]>(() => {
    const byClient = new Map<string, ClientRow & { typeCounts: Map<string, number> }>();
    jobs.forEach(job => {
      const name = (job.client || '').trim() || 'ไม่ระบุชื่อลูกค้า';
      const jobDate = job.postDate || job.startDate || null;
      const existing = byClient.get(name);
      if (existing) {
        existing.jobCount += 1;
        existing.totalRevenue += job.value;
        existing.totalPending += job.pending;
        existing.typeCounts.set(job.type, (existing.typeCounts.get(job.type) || 0) + 1);
        if (jobDate && (!existing.latestJobDate || jobDate > existing.latestJobDate)) {
          existing.latestJobDate = jobDate;
        }
      } else {
        byClient.set(name, {
          name, type: job.type, jobCount: 1, totalRevenue: job.value, totalPending: job.pending,
          latestJobDate: jobDate, typeCounts: new Map([[job.type, 1]]),
        });
      }
    });
    return Array.from(byClient.values())
      .map(({ typeCounts, ...row }) => ({
        ...row,
        // Client doesn't have its own "type" field -- show the most common job type booked
        // with them instead, the closest real-data proxy for the mockup's category column.
        type: Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || row.type,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [jobs]);

  if (clientRows.length === 0) {
    return (
      <div className="page-content">
        <div className="rounded-[14px] border border-brand-border bg-brand-white p-10 text-center flex flex-col items-center gap-3">
          <Mascot mood="wave" size={72} />
          <h3 className="text-sm font-medium text-brand-text">ยังไม่มีลูกค้าในระบบ</h3>
          <p className="text-xs text-brand-muted max-w-sm">ลูกค้าจะปรากฏที่นี่โดยอัตโนมัติทันทีที่คุณบันทึกงานพร้อมชื่อลูกค้า</p>
          <button
            type="button"
            onClick={() => onSwitchTab('jobs')}
            className="mt-2 px-5 py-2.5 bg-[#E65F2B] hover:bg-[#D98324] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            + บันทึกงานใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content space-y-4">
      <h2 className="text-[19px] font-semibold text-brand-text">ลูกค้า</h2>

      <div className="overflow-hidden rounded-[14px] border border-brand-border bg-brand-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">ชื่อ</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">ประเภท</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">จำนวนงาน</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">รายได้รวม</th>
                <th className="px-3 py-2.5 text-[11px] font-medium text-brand-muted">งานล่าสุด</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium text-brand-muted">เงินค้างรับ</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.map(row => (
                <tr key={row.name} className="border-b border-brand-border last:border-b-0 hover:bg-brand-faint/60 transition-colors">
                  <td className="px-3 py-3 font-medium text-brand-text">{row.name}</td>
                  <td className="px-3 py-3 text-brand-muted">{row.type}</td>
                  <td className="px-3 py-3 text-brand-muted">{row.jobCount}</td>
                  <td className="px-3 py-3 text-brand-text">{formatCurrency(row.totalRevenue)}</td>
                  <td className="px-3 py-3 text-brand-muted">
                    {row.latestJobDate ? safeFormatThaiDate(row.latestJobDate) : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right ${row.totalPending > 0 ? 'font-medium text-[#C24A16]' : 'text-brand-muted'}`}>
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
