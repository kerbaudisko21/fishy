import { moneyParts } from '../lib/names';

/** A big amount whose currency code wraps onto its own line when the number needs the width. Never truncated. */
export function Amount({ value, currency, className = 'amount' }: { value: number; currency: string; className?: string }) {
  const parts = moneyParts(value, currency);
  return (
    <span className={`${className} money`}>
      {parts.currency && <span className="money-cur">{parts.currency}</span>}
      <span className="money-num">{parts.number}</span>
    </span>
  );
}

export const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
