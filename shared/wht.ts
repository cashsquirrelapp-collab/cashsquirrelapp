// Withholding tax (หัก ณ ที่จ่าย) on a job. A rate is any percentage from 0 to 100 with at most
// two decimals: the presets 0/1/3/5, or a custom rate such as 1.5 or 2.25.

export const WHT_PRESET_RATES = [0, 1, 3, 5];

/** Rounds to satang (2 decimals), the unit WHT is calculated in. */
export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** True for a finite rate in 0–100 with no more than two decimal places. */
export const isValidWhtRate = (rate: number): boolean =>
  Number.isFinite(rate) && rate >= 0 && rate <= 100 && Math.abs(Math.round(rate * 100) - rate * 100) < 1e-6;

export const whtAmountFor = (gross: number, rate: number): number =>
  rate > 0 ? roundMoney(gross * (rate / 100)) : 0;

type WhtJob = { value: number; whtRate?: number; whtAmount?: number };

/** The saved WHT amount, or one computed from the rate for jobs saved without it. */
export const jobWhtAmount = (job: WhtJob): number =>
  job.whtAmount ?? whtAmountFor(job.value || 0, job.whtRate || 0);

/** What the client actually transfers: job value minus withholding tax. */
export const jobNetReceivable = (job: WhtJob): number =>
  Math.max(0, roundMoney((job.value || 0) - jobWhtAmount(job)));

// e-Withholding Tax: paid through a bank's e-WHT service, the payer withholds 1% (the 5%, 3% and
// 2% rates are cut to 1% from 1 Jan 2569 to 31 Dec 2570) and issues no 50 ทวิ; the bank sends the
// evidence to the Revenue Department, where the payee can check it. The app treats every 1% job
// as e-WHT and never waits for a paper certificate on it. A payer that does issue one (1% on
// transport is withheld outside e-WHT) can still have it attached. Every other rate needs a 50 ทวิ.
export const E_WHT_RATE = 1;

export const isEWhtJob = (job: { whtRate?: number }): boolean => job.whtRate === E_WHT_RATE;
