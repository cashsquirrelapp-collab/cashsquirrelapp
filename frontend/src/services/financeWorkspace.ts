import { getCurrentAccount } from "./api";

let current: string | undefined;
let epoch = 0;
export function financeKey(account: string, groupId?: string) {
  return groupId ? `${account}:${groupId}` : account;
}
export function setFinanceWorkspace(key?: string) {
  if (current !== key) {
    current = key;
    epoch++;
  }
}
export function workspaceEpoch() {
  return epoch;
}
export function assertFinanceWorkspace(key: string, generation = epoch) {
  const account = key.split(":")[0];
  if (
    getCurrentAccount() !== account ||
    (current && current !== key) ||
    generation !== epoch
  )
    throw Object.assign(
      new Error("บัญชีการเงินเปลี่ยนแล้ว กรุณาลองใหม่ในบัญชีที่เลือก"),
      { status: 409 },
    );
}
export function financeHeaders(key: string): Record<string, string> {
  const [account, groupId] = key.split(":");
  return {
    "X-Account-ID": account,
    ...(groupId ? { "X-Finance-Group": groupId } : {}),
  };
}
