// Montos con el formato aprobado: ₡248,500.00 y $1,120.40. Llegan de la API como texto decimal.
const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(amount: string | number, currency: 'CRC' | 'USD' = 'CRC'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency === 'USD' ? '$' : '₡'}${fmt.format(Math.abs(n))}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Hoy, ${d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
}
