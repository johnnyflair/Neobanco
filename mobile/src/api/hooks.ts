// Carga de datos que se refresca cada vez que la pantalla vuelve a estar visible
// (por ejemplo, el saldo después de un SINPE).
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

import { ApiError } from './client';

export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, setData, error, loading, reload };
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'No pudimos conectarnos. Revisá tu señal e intentá de nuevo.';
}
