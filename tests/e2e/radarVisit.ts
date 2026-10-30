// Since 2026-10-31 a plain visit with an overdue job opens the fullscreen Credit Radar (computers and iPads). Tests about
// other pages open the app the way a link with its own action does, with ?radar=0, so the radar stays closed.
export const noRadar = (path: string) => `${path}${path.includes('?') ? '&' : '?'}radar=0`;
