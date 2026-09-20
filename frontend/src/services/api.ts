let currentAccount: string | undefined;
let expired: (() => void) | undefined;
export function setCurrentAccount(id?: string) { currentAccount=id; }
export function getCurrentAccount() { return currentAccount; }
export function onSessionExpired(callback: () => void) { expired=callback; }
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const requestedAccount=currentAccount;
  const headers = new Headers(init.headers); headers.set('X-CSRF-Protection','1');
  if(currentAccount && !headers.has('X-Account-ID')) headers.set('X-Account-ID',currentAccount);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
  if(typeof init.body==='string' && new Blob([init.body]).size>4*1024*1024)throw Object.assign(new Error('ข้อมูลมีขนาดใหญ่เกินไป กรุณาลดขนาดรูปหรือไฟล์แนบ'),{status:413});
  const response=await fetch(path, { ...init, headers, credentials: 'same-origin', cache:'no-store' });
  if(response.status===401 && path!=='/api/auth' && requestedAccount===currentAccount)expired?.();
  return response;
}
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  let result:any;try{result=await response.json();}catch{throw Object.assign(new Error(response.status===413?'ข้อมูลมีขนาดใหญ่เกินไป กรุณาลดรูปหรือไฟล์แนบ':'บริการไม่พร้อมใช้งาน กรุณาลองใหม่'),{status:response.status});}
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed'), { status: response.status });
  return result;
}
