export const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const when = (t: number) =>
  new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Brand({ sub }: { sub: string }) {
  return (
    <header className="brand">
      <img src="/apple-touch-icon.png" alt="" width={32} height={32} />
      <span>
        <strong>FISHY</strong>
        <small>{sub}</small>
      </span>
    </header>
  );
}
