// Contratos de la API (espejo de backend/app/schemas.py). Los montos llegan como texto decimal.

export type Tokens = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_in: number };

export type Me = {
  id: string;
  full_name: string;
  phone_masked: string;
  email: string;
  province: string;
  canton: string;
  kyc_status: string;
  points: number;
  member_since: string;
};

export type AccountType = 'savings' | 'capital' | 'envelope' | 'term';

export type Account = {
  id: string;
  type: AccountType;
  name: string;
  currency: 'CRC' | 'USD';
  balance: string;
  iban_masked: string | null;
  subtitle: string;
};

export type Transaction = {
  id: string;
  amount: string;
  balance_after: string;
  description: string;
  category: string;
  created_at: string;
};

export type TransactionPage = { items: Transaction[]; next_before: string | null };

export type Card = {
  id: string;
  kind: 'debit' | 'credit';
  product_name: string;
  brand: string;
  last4: string;
  holder_name: string;
  expiry: string;
  status: 'active' | 'locked';
  online_enabled: boolean;
  international_enabled: boolean;
  linked_mode: 'crc' | 'usd' | 'auto' | null;
  limits: { store: string; online: string; atm: string };
  limits_are_default: boolean;
  credit: null | {
    limit: string;
    balance: string;
    available: string;
    full_payment: string;
    minimum_payment: string;
    statement_day: number;
    due_date: string | null;
  };
};

export type Problem = { code: string; title: string; status: number; request_id?: string };
