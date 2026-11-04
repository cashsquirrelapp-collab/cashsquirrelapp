// What เลขากระรอก is doing while it works (owner, 2026-11-04: "เวลาที่ทำอะไรนานๆยาวๆ อยากให้มีสถานะบอกว่ากำลังทำไรด้วย แบบของ
// Claude หรือ GPT"). The server sends these as the request runs (backend/src/handlers/assistant.ts, one JSON object per
// line); the chat turns them into words (frontend/src/features/assistant/workSteps.ts). Only what happens is sent: which
// kind of model step, which tool by its name. Never model or vendor names, never data from the account.

export type AssistantProgress =
  /** A model step: the first reading, the hand-over to prepare changes, or a second look. */
  | { kind: 'model'; route: 'chat' | 'action'; round: number; files: number; web: boolean }
  /** A tool the step called (search_jobs, propose_add_job …). */
  | { kind: 'tool'; name: string };

export const isAssistantProgress = (value: unknown): value is AssistantProgress => {
  const item = value as AssistantProgress | null;
  if (!item || typeof item !== 'object') return false;
  if (item.kind === 'tool') return typeof item.name === 'string' && /^[a-z_]{1,48}$/.test(item.name);
  return item.kind === 'model' && (item.route === 'chat' || item.route === 'action') && Number.isInteger(item.round) && Number.isInteger(item.files) && typeof item.web === 'boolean';
};
