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

/** 88124455 → 8812-4455 (mientras se escribe también). */
export function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

/** CR05015202001026284066 → CR05 0152 0200 1026 2840 66 (mientras se escribe también). */
export function formatIban(v: string): string {
  const c = v.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 22);
  return c.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Monto escrito por la persona ("25,000" o "25000.5") → texto decimal para la API, o null si no es válido. */
export function parseAmount(v: string): string | null {
  const clean = v.replace(/[^0-9.]/g, '');
  if (!clean || (clean.match(/\./g) ?? []).length > 1) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** "2026-11-10" → "10 nov" (fecha sin zona horaria, para que no se corra un día). */
export function dayMonth(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** "5123456789014417" → "5123 4567 8901 4417" */
export const groupPan = (pan: string) => pan.replace(/(.{4})(?=.)/g, '$1 ');
