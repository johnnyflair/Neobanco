// Avisos (campana del inicio): se arman con lo que ya trae la App — dinero recibido, sobres
// eliminados, recibos por vencer y el pago de la tarjeta de crédito. "Nuevos" son los que llegaron
// después de la última vez que abriste Avisos; los recibos y la tarjeta pendientes siempre lo son.
import { longDate, money } from '../format';
import { secureStore } from '../secureStore';
import type { IconName } from '../ui/Icon';
import { api } from './client';
import type { Transaction } from './types';

const SEEN_KEY = 'neo.noticesSeen';
const DAY = 86_400_000;

export type Notice = {
  id: string;
  icon: IconName;
  title: string;
  sub: string;
  at: number; // para ordenar y para "hace 2 h"
  when?: string; // texto fijo en vez de la hora (por ejemplo, "Pendiente")
  isNew: boolean;
  /** Algo por pagar: va en "Por pagar" con su botón Pagar. */
  due?: boolean;
  incoming?: boolean;
  go: { tx: Transaction } | { route: 'Bills' | 'Cards' };
};

const HOW: Record<string, [IconName, string]> = {
  sinpe: ['phone', 'por SINPE Móvil'],
  iban: ['swap', 'por transferencia'],
  pull: ['pull', 'desde otro banco'],
  salary: ['cash', 'de salario'],
};

export async function loadNotices(): Promise<Notice[]> {
  const [txs, bills, cards, seenRaw] = await Promise.all([
    api.allTransactions().then((r) => r.items).catch(() => [] as Transaction[]),
    api.savedBills().catch(() => []),
    api.cards().catch(() => []),
    secureStore.get(SEEN_KEY),
  ]);
  const seen = seenRaw ? Number(seenRaw) : 0;
  const since = Date.now() - 14 * DAY;
  const out: Notice[] = [];

  for (const t of txs) {
    const at = new Date(t.created_at).getTime();
    if (at < since || Number(t.amount) <= 0) continue;
    const how = HOW[t.category];
    const closed = t.category === 'envelope' && /^(Cierre|Desde el sobre)/.test(t.description);
    if (!how && !closed) continue;
    out.push(
      closed
        ? {
            id: t.id,
            icon: 'pig',
            title: `Eliminaste el sobre ${(t.counterparty ?? '').replace(/^el sobre /, '')}`.trim(),
            sub: `${money(t.amount)} volvieron a tu cuenta`,
            at,
            isNew: at > seen,
            go: { tx: t },
          }
        : {
            id: t.id,
            icon: how[0],
            title: `Recibiste ${money(t.amount, (t.currency as 'CRC' | 'USD' | null) ?? 'CRC')}`,
            sub: t.counterparty ? `${t.counterparty} te envió ${how[1]}` : `Entró ${how[1]}`,
            at,
            isNew: at > seen,
            incoming: true,
            go: { tx: t },
          },
    );
  }

  for (const b of bills) {
    if (!b.pending_amount || !b.due_date) continue;
    const due = new Date(b.due_date).getTime();
    if (due - Date.now() > 10 * DAY) continue;
    out.push({
      id: `bill-${b.id}`,
      icon: 'receipt',
      title: `${b.provider_name} · ${money(b.pending_amount)}`,
      sub: `Vence el ${longDate(b.due_date)}`,
      at: due,
      isNew: true,
      due: true,
      go: { route: 'Bills' },
    });
  }

  for (const c of cards) {
    const due = c.credit?.due_date;
    if (!c.credit || !due || Number(c.credit.full_payment) <= 0) continue;
    out.push({
      id: `card-${c.id}`,
      icon: 'card',
      title: `Tarjeta de crédito · ${money(c.credit.full_payment)}`,
      sub: `Vence el ${longDate(due)}`,
      at: new Date(due).getTime(),
      isNew: true,
      due: true,
      go: { route: 'Cards' },
    });
  }

  return out.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.at - a.at);
}

/** Al abrir Avisos: lo que había deja de ser nuevo. */
export function markNoticesSeen() {
  return secureStore.set(SEEN_KEY, String(Date.now()));
}

export function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Hace ${h} h`;
  if (h < 48) return 'Ayer';
  return longDate(new Date(at).toISOString());
}
