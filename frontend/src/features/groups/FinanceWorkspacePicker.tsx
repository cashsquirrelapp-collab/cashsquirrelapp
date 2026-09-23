import { useEffect, useRef, useState } from "react";
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
  const loadedAccount = useRef(account);
  const lastRefresh = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    if (loadedAccount.current !== account) {
      loadedAccount.current = account;
      lastRefresh.current = 0;
      setGroups([]);
    }
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
      if (!abort.signal.aborted) {
        setGroups(rows);
        lastRefresh.current = Date.now();
      }
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current > 30000) {
        setRevision((n) => n + 1);
      }
    };
    window.addEventListener("focus", refresh);
    return () => {
      abort.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [account, revision]);
  return (
    <div className="relative flex min-w-0 items-center gap-1.5">
      <div className="flex min-w-0 items-center rounded-2xl border border-brand-border bg-brand-bg p-1 shadow-sm">
        <div className="hidden rounded-xl bg-emerald-50 p-2 text-emerald-700 sm:block" aria-hidden="true">
          {groupId ? <Users size={16} /> : <Wallet size={16} />}
        </div>
        <label htmlFor="finance-workspace" className="sr-only">บัญชีการเงิน</label>
          <select
            id="finance-workspace"
            value={groupId || ""}
            disabled={busy}
            title={groupId ? "บัญชีการเงินของกลุ่ม" : "บัญชีการเงินส่วนตัว"}
            onChange={(e) => {
              const id = e.target.value || undefined;
              void onChange(id, groups.find((group) => group.id === id)?.name);
            }}
            className="w-26 min-w-0 cursor-pointer border-0 bg-transparent px-2 py-1.5 text-xs font-extrabold text-brand-text outline-none disabled:cursor-wait sm:w-44"
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
        <button
          type="button"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
          aria-label="รีเฟรชบัญชีการเงิน"
          className="rounded-xl p-2 text-brand-muted transition-colors hover:bg-brand-white hover:text-brand-text disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {error && (
        <p role="alert" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700 shadow-lg">
          โหลดรายชื่อกลุ่มไม่สำเร็จ: {error}
        </p>
      )}
    </div>
  );
}
