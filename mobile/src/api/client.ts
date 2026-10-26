// Cliente de la API.
// - El access token vive solo en memoria; el refresh token en el llavero del teléfono (SecureStore).
// - Si un pedido recibe 401, renueva la sesión una vez y lo reintenta.
// - Toda operación que mueve plata lleva Idempotency-Key, para que un reintento por mala señal
//   nunca cobre dos veces.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { Account, Card, Me, Problem, Tokens, TransactionPage } from './types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const REFRESH_KEY = 'neo.refresh';

if (!__DEV__ && !API_URL.startsWith('https://')) {
  throw new Error('En producción la API debe usar HTTPS');
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

async function saveTokens(t: Tokens) {
  accessToken = t.access_token;
  await SecureStore.setItemAsync(REFRESH_KEY, t.refresh_token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function hasSavedSession(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const p = body as Partial<Problem>;
    throw new ApiError(res.status, p.code ?? 'error', p.title ?? 'Algo salió mal. Intentá de nuevo.', p.request_id);
  }
  return body as T;
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!rt) return false;
    const res = await raw('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) });
    if (!res.ok) {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      accessToken = null;
      return false;
    }
    await saveTokens(await res.json());
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && accessToken !== null) {
    if (await refreshSession()) {
      res = await raw(path, init);
    } else {
      onSessionLost();
    }
  }
  return parse<T>(res);
}

function moneyMove<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': Crypto.randomUUID() },
  });
}

export const api = {
  async login(identifier: string, pin: string) {
    const t = await parse<Tokens>(await raw('/v1/auth/login', { method: 'POST', body: JSON.stringify({ identifier, pin }) }));
    await saveTokens(t);
  },
  async logout() {
    const rt = await SecureStore.getItemAsync(REFRESH_KEY);
    if (rt) await raw('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) }).catch(() => {});
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    accessToken = null;
  },
  me: () => request<Me>('/v1/me'),
  accounts: () => request<{ accounts: Account[] }>('/v1/accounts').then((r) => r.accounts),
  transactions: (accountId: string, before?: string) =>
    request<TransactionPage>(
      `/v1/accounts/${accountId}/transactions?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),
  cards: () => request<Card[]>('/v1/cards'),
  lockCard: (id: string) => request<Card>(`/v1/cards/${id}/lock`, { method: 'POST' }),
  sinpe: (fromAccountId: string, phone: string, amount: string, description?: string) =>
    moneyMove<{ reference: string; counterparty_name: string; points_earned: number }>('/v1/transfers/sinpe', {
      from_account_id: fromAccountId,
      phone,
      amount,
      description,
    }),
};
