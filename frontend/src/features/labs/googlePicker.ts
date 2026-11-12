// Google's own file picker (ฟีเจอร์ทดลอง, phase 2). The person chooses a Google Sheet in Google's window; choosing it is what
// lets the app open that one file (the drive.file permission). Google's script loads only when the picker is first
// opened, never on other pages. The site's CSP allows https://apis.google.com (script) and docs/drive.google.com (frame).

interface PickerApi {
  ViewId: { SPREADSHEETS: string };
  DocsViewMode: { LIST: string };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string };
  DocsView: new (viewId: string) => { setMimeTypes(types: string): unknown; setMode(mode: string): unknown; setIncludeFolders(value: boolean): unknown };
  PickerBuilder: new () => PickerBuilder;
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (data: Record<string, unknown>) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void; dispose?(): void };
}
type Gapi = { load(name: string, options: { callback: () => void; onerror?: () => void; timeout?: number; ontimeout?: () => void }): void };
const win = window as unknown as { gapi?: Gapi; google?: { picker?: PickerApi } };

let loading: Promise<PickerApi> | null = null;
function loadPicker(): Promise<PickerApi> {
  if (win.google?.picker) return Promise.resolve(win.google.picker);
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const fail = () => { loading = null; reject(new Error('picker')); };
    const ready = () => (win.google?.picker ? resolve(win.google.picker) : fail());
    const loadModule = () => win.gapi ? win.gapi.load('picker', { callback: ready, onerror: fail, timeout: 15_000, ontimeout: fail }) : fail();
    if (win.gapi) { loadModule(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = loadModule;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/** Opens Google's picker on the person's Google Sheets. The chosen file, or null when they close it. */
export async function pickSheet(options: { token: string; apiKey: string; appId: string; locale: string; title: string }): Promise<{ id: string; name: string } | null> {
  const api = await loadPicker();
  return new Promise(resolve => {
    const view = new api.DocsView(api.ViewId.SPREADSHEETS);
    view.setMimeTypes(SHEET_MIME);
    view.setMode(api.DocsViewMode.LIST);
    view.setIncludeFolders(false);
    const picker = new api.PickerBuilder()
      .addView(view)
      .setOAuthToken(options.token)
      .setDeveloperKey(options.apiKey)
      .setAppId(options.appId)
      .setLocale(options.locale)
      .setTitle(options.title)
      .setCallback(data => {
        const action = data[api.Response.ACTION];
        if (action === api.Action.PICKED) {
          const doc = (data[api.Response.DOCUMENTS] as Record<string, unknown>[] | undefined)?.[0];
          const id = doc?.[api.Document.ID];
          resolve(typeof id === 'string' ? { id, name: String(doc?.[api.Document.NAME] ?? '') } : null);
          picker.dispose?.();
        } else if (action === api.Action.CANCEL) {
          resolve(null);
          picker.dispose?.();
        }
      })
      .build();
    picker.setVisible(true);
  });
}
