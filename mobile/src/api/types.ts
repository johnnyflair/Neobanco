// Contratos de la API (espejo de backend/app/schemas.py). Los montos llegan como texto decimal.

export type Tokens = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_in: number };

export type Me = {
  id: string;
  full_name: string;
  phone_masked: string;
  sinpe_phone: string;
  email: string;
  province: string;
  canton: string;
  kyc_status: string;
  points: number;
  member_since: string;
};

export type AccountType = 'savings' | 'capital' | 'envelope' | 'term';
export type Currency = 'CRC' | 'USD';

export type Account = {
  id: string;
  type: AccountType;
  name: string;
  currency: Currency;
  balance: string;
  iban_masked: string | null;
  subtitle: string;
};

export type AccountDetail = Account & { iban: string | null };

export type Transaction = {
  id: string;
  amount: string;
  balance_after: string;
  description: string;
  category: string;
  created_at: string;
};

export type TransactionPage = { items: Transaction[]; next_before: string | null };

export type LinkedMode = 'crc' | 'usd' | 'auto';
export type CardLimits = { store: string; online: string; atm: string };

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
  linked_mode: LinkedMode | null;
  limits: CardLimits;
  limits_are_default: boolean;
  credit: null | {
    limit: string;
    balance: string;
    available: string;
    full_payment: string;
    minimum_payment: string;
    statement_day: number;
    due_date: string | null;
    points_per_1000: number;
  };
};

export type CardSecrets = { pan: string; cvv: string; expiry: string };
export type Purchase = { id: string; merchant: string; amount: string; installments: number | null; created_at: string };
export type InstallmentPlan = { purchase_id: string; months: number; monthly_payment: string; total: string; monthly_rate: string };
export type CardPayment = { reference: string; amount: string; new_balance: string };

export type Transfer = {
  id: string;
  kind: 'sinpe' | 'iban' | 'pull';
  amount: string;
  currency: Currency;
  counterparty_name: string | null;
  status: string;
  reference: string;
  created_at: string;
  points_earned: number;
};

export type SinpeContact = { phone: string; name: string; bank?: string };
export type IbanHolder = { iban_masked: string; holder: string };
export type LinkedAccount = { id: string; bank_name: string; label: string; iban_masked: string; authorized: boolean };
export type PullPending = { status: 'pending_authorization'; linked_account_id: string; message: string };

export type Problem = { code: string; title: string; status: number; request_id?: string };
