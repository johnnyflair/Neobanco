// Cliente de la API.
// - El access token vive solo en memoria; el refresh token en el llavero del teléfono (SecureStore).
// - Si un pedido recibe 401, renueva la sesión una vez y lo reintenta.
// - Toda operación que mueve plata lleva Idempotency-Key, para que un reintento por mala señal
//   nunca cobre dos veces.
import * as Crypto from 'expo-crypto';

import type {
  Account,
  AccountDetail,
  Card,
  FraudReason,
  RedeemDestination,
  RedeemResult,
  RegisterBody,
  RegisterResult,
  OtpStart,
  Rewards,
  SupportCase,
  CardLimits,
  CardPayment,
  CardSecrets,
  IbanHolder,
  InstallmentPlan,
  LinkedAccount,
  LinkedMode,
  Me,
  Problem,
  PullPending,
  Purchase,
  SinpeContact,
  Tokens,
  TransactionPage,
  Transfer,
  BillPayment,
  BillProvider,
  BillQuote,
  SavedBill,
  LoanApplication,
  LoanDisbursement,
  LoanOffer,
  LoanSim,
  Rate,
  TermDepositResult,
} from './types';
import { secureStore } from '../secureStore';

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
  await secureStore.set(REFRESH_KEY, t.refresh_token);
}

export async function hasSavedSession(): Promise<boolean> {
  return (await secureStore.get(REFRESH_KEY)) !== null;
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
    const rt = await secureStore.get(REFRESH_KEY);
    if (!rt) return false;
    const res = await raw('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) });
    if (!res.ok) {
      await secureStore.remove(REFRESH_KEY);
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

// Una llave por intención de pago: la pantalla la crea una vez y la reusa si la persona reintenta,
// así un segundo toque o una mala señal nunca cobran dos veces.
export const newIdempotencyKey = () => Crypto.randomUUID();

function moneyMove<T>(path: string, body: unknown, key: string): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': key },
  });
}

export const api = {
  async login(identifier: string, pin: string) {
    const t = await parse<Tokens>(await raw('/v1/auth/login', { method: 'POST', body: JSON.stringify({ identifier, pin }) }));
    await saveTokens(t);
  },
  // Registro (público): código por SMS, verificación y alta. Si queda verificado, entra directo.
  otpStart: (phone: string) =>
    raw('/v1/auth/otp/start', { method: 'POST', body: JSON.stringify({ phone }) }).then((r) => parse<OtpStart>(r)),
  otpVerify: (challengeId: string, code: string) =>
    raw('/v1/auth/otp/verify', { method: 'POST', body: JSON.stringify({ challenge_id: challengeId, code }) }).then((r) =>
      parse<{ onboarding_token: string; expires_in: number }>(r),
    ),
  async register(body: RegisterBody) {
    const r = await parse<RegisterResult>(await raw('/v1/auth/register', { method: 'POST', body: JSON.stringify(body) }));
    if (r.tokens) await saveTokens(r.tokens);
    return r;
  },
  // Simuladores públicos (modo visitante): no requieren sesión.
  publicLoanSimulate: (amount: number, termMonths: number) =>
    raw('/v1/loans/simulate', { method: 'POST', body: JSON.stringify({ amount, term_months: termMonths }) }).then((r) =>
      parse<LoanSim>(r),
    ),
  publicRates: () => raw('/v1/savings/rates').then((r) => parse<Rate[]>(r)),
  async logout() {
    const rt = await secureStore.get(REFRESH_KEY);
    if (rt) await raw('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) }).catch(() => {});
    await secureStore.remove(REFRESH_KEY);
    accessToken = null;
  },
  me: () => request<Me>('/v1/me'),
  accounts: () => request<{ accounts: Account[] }>('/v1/accounts').then((r) => r.accounts),
  transactions: (accountId: string, before?: string) =>
    request<TransactionPage>(
      `/v1/accounts/${accountId}/transactions?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),
  allTransactions: (accountIds: string[] = [], before?: string) => {
    const q = new URLSearchParams({ limit: '30' });
    accountIds.forEach((id) => q.append('account_id', id));
    if (before) q.set('before', before);
    return request<TransactionPage>(`/v1/transactions?${q.toString()}`);
  },
  account: (id: string) => request<AccountDetail>(`/v1/accounts/${id}`),

  // Tarjetas
  cards: () => request<Card[]>('/v1/cards'),
  card: (id: string) => request<Card>(`/v1/cards/${id}`),
  lockCard: (id: string) => request<Card>(`/v1/cards/${id}/lock`, { method: 'POST' }),
  unlockCard: (id: string, pin: string) =>
    request<Card>(`/v1/cards/${id}/unlock`, { method: 'POST', body: JSON.stringify({ pin }) }),
  cardSettings: (id: string, body: { online_enabled?: boolean; international_enabled?: boolean; linked_mode?: LinkedMode }) =>
    request<Card>(`/v1/cards/${id}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
  cardLimits: (id: string, limits: CardLimits, pin?: string) =>
    request<Card>(`/v1/cards/${id}/limits`, { method: 'PUT', body: JSON.stringify({ ...limits, pin }) }),
  revealCard: (id: string, pin: string) =>
    request<CardSecrets>(`/v1/cards/${id}/reveal`, { method: 'POST', body: JSON.stringify({ pin }) }),
  payCard: (id: string, mode: 'full' | 'minimum' | 'other', fromAccountId: string, key: string, amount?: string) =>
    moneyMove<CardPayment>(`/v1/cards/${id}/payments`, { mode, amount, from_account_id: fromAccountId }, key),
  purchases: (id: string) => request<Purchase[]>(`/v1/cards/${id}/purchases`),
  installments: (id: string, purchaseId: string, months: number) =>
    request<InstallmentPlan>(`/v1/cards/${id}/installments`, {
      method: 'POST',
      body: JSON.stringify({ purchase_id: purchaseId, months }),
    }),

  // Transferencias
  sinpeRecent: () => request<SinpeContact[]>('/v1/transfers/sinpe/recent'),
  sinpeLookup: (phone: string) => request<SinpeContact>(`/v1/transfers/sinpe/lookup?phone=${encodeURIComponent(phone)}`),
  sinpe: (fromAccountId: string, phone: string, amount: string, key: string, description?: string) =>
    moneyMove<Transfer>('/v1/transfers/sinpe', { from_account_id: fromAccountId, phone, amount, description }, key),
  ibanLookup: (iban: string) => request<IbanHolder>(`/v1/transfers/iban/lookup?iban=${encodeURIComponent(iban)}`),
  iban: (fromAccountId: string, iban: string, amount: string, key: string, description?: string) =>
    moneyMove<Transfer>('/v1/transfers/iban', { from_account_id: fromAccountId, iban, amount, description }, key),
  linkedAccounts: () => request<LinkedAccount[]>('/v1/transfers/linked-accounts'),
  pull: (toAccountId: string, amount: string, source: { linked_account_id: string } | { new_iban: string }, key: string) =>
    moneyMove<Transfer | PullPending>('/v1/transfers/pull', { to_account_id: toAccountId, amount, ...source }, key),

  // Pago de servicios
  billCategories: () => request<{ name: string }[]>('/v1/bills/categories'),
  billProviders: (q?: string, category?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    return request<BillProvider[]>(`/v1/bills/providers?${qs.toString()}`);
  },
  billLookup: (providerId: string, reference: string) =>
    request<BillQuote>('/v1/bills/lookup', { method: 'POST', body: JSON.stringify({ provider_id: providerId, reference }) }),
  /** expectedAmount: el monto que la persona aprobó; si el recibo cambió, la API no cobra. */
  payBill: (providerId: string, reference: string, fromAccountId: string, key: string, save = true, autopay = false, expectedAmount?: string) =>
    moneyMove<BillPayment>(
      '/v1/bills/pay',
      { provider_id: providerId, reference, from_account_id: fromAccountId, save, autopay, expected_amount: expectedAmount },
      key,
    ),
  savedBills: () => request<SavedBill[]>('/v1/bills/saved'),
  setAutopay: (id: string, autopay: boolean) =>
    request<SavedBill>(`/v1/bills/saved/${id}`, { method: 'PATCH', body: JSON.stringify({ autopay }) }),

  // Préstamos
  loanSimulate: (amount: number, termMonths: number) =>
    request<LoanSim>('/v1/loans/simulate', { method: 'POST', body: JSON.stringify({ amount, term_months: termMonths }) }),
  loanOffer: () => request<LoanOffer>('/v1/loans/offer'),
  loanApplications: () => request<LoanApplication[]>('/v1/loans/applications'),
  loanApply: (body: { amount: number; term_months: number; income_type: string; monthly_income: string }) =>
    request<LoanApplication>('/v1/loans/applications', { method: 'POST', body: JSON.stringify(body) }),
  loanDisburse: (amount: number, termMonths: number, toAccountId: string, pin: string, key: string) =>
    moneyMove<LoanDisbursement>(
      '/v1/loans/disbursements',
      { amount, term_months: termMonths, to_account_id: toAccountId, pin },
      key,
    ),

  // Ahorro: sobres y plazos
  rates: () => request<Rate[]>('/v1/savings/rates'),
  createEnvelope: (body: { name: string; goal_amount: string; months: number; mode: 'fixed' | 'roundup' | 'percent' }) =>
    request<Account>('/v1/savings/envelopes', { method: 'POST', body: JSON.stringify(body) }),
  envelopeMove: (envelopeId: string, direction: 'deposit' | 'withdraw', amount: string, accountId: string, key: string) =>
    moneyMove<{ reference: string; envelope_balance: string }>(
      `/v1/savings/envelopes/${envelopeId}/${direction}`,
      { amount, account_id: accountId },
      key,
    ),
  openTermDeposit: (body: { from_account_id: string; amount: string; term_months: number; on_maturity: string }, key: string) =>
    moneyMove<TermDepositResult>('/v1/savings/term-deposits', body, key),

  // Recompensas
  rewards: () => request<Rewards>('/v1/rewards'),
  redeem: (destination: RedeemDestination, targetId?: string) =>
    request<RedeemResult>('/v1/rewards/redeem', { method: 'POST', body: JSON.stringify({ destination, target_id: targetId }) }),
  autoRule: () => request<{ destination: RedeemDestination | null }>('/v1/rewards/auto-rule'),
  setAutoRule: (destination: RedeemDestination | null) =>
    request<{ destination: RedeemDestination | null }>('/v1/rewards/auto-rule', { method: 'PUT', body: JSON.stringify({ destination }) }),

  // Ayuda
  reportFraud: (reason: FraudReason) =>
    request<SupportCase>('/v1/support/fraud', { method: 'POST', body: JSON.stringify({ reason }) }),
  supportCases: () => request<SupportCase[]>('/v1/support/cases'),
  supportCase: (n: string) => request<SupportCase>(`/v1/support/cases/${encodeURIComponent(n)}`),
};
