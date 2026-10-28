// Small signals the post-payment guide listens for, kept apart so the chat and Settings do not load the guide itself.
export const ASSISTANT_SENT_EVENT = 'krarok:assistant-sent';
export const ISSUER_SAVED_EVENT = 'krarok:issuer-saved';

export function noteAssistantSent() {
  try { window.dispatchEvent(new Event(ASSISTANT_SENT_EVENT)); } catch { /* no window (tests) */ }
}

export function noteIssuerSaved() {
  try { window.dispatchEvent(new Event(ISSUER_SAVED_EVENT)); } catch { /* no window (tests) */ }
}
