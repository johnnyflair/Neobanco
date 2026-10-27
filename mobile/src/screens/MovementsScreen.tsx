// "Ver todos" (opción B aprobada): historial de todas las cuentas juntas, agrupado por día, con
// filtros por cuenta. Cada movimiento dice de qué cuenta es y se abre en su hoja de detalle.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';

import { api } from '../api/client';
import { errorMessage } from '../api/hooks';
import type { Account, Transaction } from '../api/types';
import { Btn, Chips, ErrorText, Loading, Screen, Small } from '../ui/kit';
import { MoveList, MoveSheet } from '../ui/Moves';

type Filter = 'all' | 'crc' | 'usd' | 'capital' | 'envelope' | 'term';

function idsFor(f: Filter, accounts: Account[]) {
  const pick = (a: Account) =>
    f === 'crc'
      ? a.type === 'savings' && a.currency === 'CRC'
      : f === 'usd'
        ? a.type === 'savings' && a.currency === 'USD'
        : a.type === f;
  return f === 'all' ? [] : accounts.filter(pick).map((a) => a.id);
}

export function MovementsScreen() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<Transaction[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setError(null);
    setBusy(true);
    try {
      const accts = await api.accounts();
      setAccounts(accts);
      const page = await api.allTransactions(idsFor(f, accts));
      setItems(page.items);
      setNext(page.next_before);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter]),
  );

  async function more() {
    if (!next || !accounts) return;
    setBusy(true);
    try {
      const page = await api.allTransactions(idsFor(filter, accounts), next);
      setItems((x) => [...x, ...page.items]);
      setNext(page.next_before);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Solo se muestran los filtros de cuentas que el asociado tiene.
  const options = useMemo(() => {
    const has = (f: Filter) => !!accounts && idsFor(f, accounts).length > 0;
    const all: { value: Filter; label: string }[] = [
      { value: 'all', label: 'Todas' },
      { value: 'crc', label: 'Colones' },
      { value: 'usd', label: 'Dólares' },
      { value: 'capital', label: 'Capital social' },
      { value: 'envelope', label: 'Sobres' },
      { value: 'term', label: 'Plazos' },
    ];
    return all.filter((o) => o.value === 'all' || has(o.value));
  }, [accounts]);

  if (!accounts && !error) return <Loading />;
  return (
    <Screen title="Movimientos">
      <Chips options={options} value={filter} onChange={setFilter} />
      <MoveList items={items} showAccount={filter === 'all' || filter === 'envelope' || filter === 'term'} onPress={setMove} />
      <MoveSheet t={move} accountName="" onClose={() => setMove(null)} />
      {!items.length && !busy && !error && <Small style={{ marginTop: 16 }}>Sin movimientos en esta cuenta todavía.</Small>}
      {next && <Btn label="Ver más" variant="l" onPress={more} loading={busy} />}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
