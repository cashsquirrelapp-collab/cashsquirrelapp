// One way to write baht in เลขา's money cards (2026-10-25), on the server and in the app, so a chart, its table,
// its totals and the text quoting them never disagree: ฿12,500.00, -฿1,200.50.
const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
export const formatTHB = (amount: number) => THB.format(amount);
