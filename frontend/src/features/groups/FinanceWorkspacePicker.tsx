import React, { useEffect, useState } from "react";
import { Users, Wallet, RefreshCw } from "lucide-react";
import type { GroupSummary } from "../../../../shared/groups";
import { groupApi } from "../../services/groups";

export default function FinanceWorkspacePicker({
  account,
  groupId,
  busy,
  onChange,
}: {
  account: string;
  groupId?: string;
  busy: boolean;
  onChange: (groupId?: string, name?: string) => Promise<void>;
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setGroups([]);
    setError("");
    (async () => {
      const rows: GroupSummary[] = [];
      for (let page = 0; page < 10; page++) {
        const result = await groupApi.snapshot(
          account,
          "mine",
          page,
          abort.signal,
        );
        rows.push(...result.groups.filter((group) => group.myRole));
        if ((page + 1) * 20 >= result.total) break;
      }
      if (!abort.signal.aborted) setGroups(rows);
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((n) => n + 1);
    };
    window.addEventListener("focus", refresh);
    return () => {
      abort.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [account, revision]);
  return (
    <div className="shrink-0 border-b border-brand-border/40 bg-brand-white px-5 py-3 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
          {groupId ? <Users size={20} /> : <Wallet size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="finance-workspace"
            className="block text-xs font-bold text-brand-muted mb-1"
          >
            บัญชีการเงิน
          </label>
          <select
            id="finance-workspace"
            value={groupId || ""}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value || undefined;
              void onChange(id, groups.find((group) => group.id === id)?.name);
            }}
            className="w-full max-w-md rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm font-bold text-brand-text"
          >
            <option value="">ส่วนตัว</option>
            {groupId && !groups.some((group) => group.id === groupId) && (
              <option value={groupId}>กลุ่มที่เลือก — กดรีเฟรชรายชื่อ</option>
            )}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                กลุ่ม: {group.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
          aria-label="รีเฟรชบัญชีการเงิน"
          className="rounded-xl border border-brand-border p-2 text-brand-muted"
        >
          <RefreshCw size={16} />
        </button>
        <p className="w-full sm:w-auto text-xs text-brand-muted">
          {busy
            ? "กำลังบันทึกและเปลี่ยนบัญชี…"
            : groupId
              ? "สมาชิกทุกคนดูและแก้ไขได้"
              : "ข้อมูลส่วนตัวของคุณ"}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          โหลดรายชื่อกลุ่มไม่สำเร็จ: {error}
        </p>
      )}
    </div>
  );
}
