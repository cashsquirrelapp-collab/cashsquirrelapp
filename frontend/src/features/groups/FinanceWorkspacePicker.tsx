import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronsUpDown, Users, Wallet } from "lucide-react";
import type { GroupSummary } from "../../../../shared/groups";
import { groupApi } from "../../services/groups";

export default function FinanceWorkspacePicker({
  account,
  groupId,
  busy,
  onChange,
  variant = "compact",
}: {
  account: string;
  groupId?: string;
  busy: boolean;
  onChange: (groupId?: string, name?: string) => Promise<void>;
  /** "row": full-width row in the sidebar account card; "compact": pill in the phone header. */
  variant?: "row" | "compact";
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
  const Icon = groupId ? Users : Wallet;
  const currentLabel = groupId ? groups.find((group) => group.id === groupId)?.name || "กลุ่มที่เลือก" : "ส่วนตัว";
  const select = (className: string) => (
    <select
      id="finance-workspace"
      value={groupId || ""}
      disabled={busy}
      title={groupId ? "บัญชีการเงินของกลุ่ม" : "บัญชีการเงินส่วนตัว"}
      onChange={(e) => {
        const id = e.target.value || undefined;
        void onChange(id, groups.find((group) => group.id === id)?.name);
      }}
      className={`min-w-0 appearance-none cursor-pointer border-0 bg-transparent text-brand-text outline-none disabled:cursor-wait ${className}`}
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
  );
  return (
    <div className="relative flex min-w-0 items-center">
      <label htmlFor="finance-workspace" className="sr-only">บัญชีการเงิน</label>
      {variant === "row" ? (
        <div className="group relative flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-brand-faint">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]" aria-hidden="true">
            <Icon size={16} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] leading-tight text-brand-muted" aria-hidden="true">บัญชีการเงิน</span>
            <span className="block truncate pr-6 text-[13px] font-semibold leading-tight text-brand-text" aria-hidden="true">{currentLabel}</span>
          </span>
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
          {/* The real select covers the whole row so a click anywhere opens it */}
          {select("absolute inset-0 h-full w-full opacity-0")}
        </div>
      ) : (
        <div className="relative flex min-w-0 items-center gap-1.5 rounded-full border border-brand-border bg-brand-white py-1 pl-1.5 pr-2 shadow-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]" aria-hidden="true">
            <Icon size={14} strokeWidth={2.2} />
          </span>
          {select("w-24 py-1 pr-5 text-xs font-semibold sm:w-36")}
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
        </div>
      )}
      {error && (
        <p role="alert" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700 shadow-lg">
          โหลดรายชื่อกลุ่มไม่สำเร็จ: {error}
        </p>
      )}
    </div>
  );
}
