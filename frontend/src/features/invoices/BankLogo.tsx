import { thaiBankLogo, type ThaiBank } from './thaiBanks';

/** A bank's round logo, or its short code in a neutral circle when there is no logo file. */
export function BankLogo({ bank, size = 28, className = '' }: { bank: ThaiBank | undefined; size?: number; className?: string }) {
  const logo = thaiBankLogo(bank);
  if (logo) return <img src={logo} alt="" width={size} height={size} className={`shrink-0 rounded-full ring-1 ring-black/5 ${className}`} style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-faint font-semibold text-brand-muted ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.28) }}>
      {bank ? bank.code.replace(/\s/g, '').slice(0, 4) : '฿'}
    </span>
  );
}
