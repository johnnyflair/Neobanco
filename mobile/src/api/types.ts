// Contratos de la API (espejo de backend/app/schemas.py). Los montos llegan como texto decimal.

export type Tokens = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_in: number };

export type Me = {
  id: string;
  full_name: string;
  phone_masked: string;
  cedula_masked: string;
  sinpe_phone: string;
  email: string;
  province: string;
  canton: string;
  kyc_status: string;
  points: number;
  member_since: string;
  photo?: string | null;
  is_demo?: boolean;
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
  goal_amount?: string | null;
  savings_mode?: string | null;
  rate?: string | null;
  term_months?: number | null;
  maturity_date?: string | null;
  on_maturity?: string | null;
};

export type AccountDetail = Account & {
  iban: string | null;
  client_account: string | null;
  holder_name: string | null;
  monthly_contribution: string | null;
};

export type Transaction = {
  id: string;
  amount: string;
  balance_after: string;
  description: string;
  category: string;
  created_at: string;
  title: string;
  counterparty: string | null;
  detail: string | null;
  reference: string | null;
  account_id?: string | null;
  account_name?: string | null;
  currency?: string | null;
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
  description?: string | null;
  status: string;
  reference: string;
  created_at: string;
  points_earned: number;
};

export type SinpeContact = { phone: string; name: string; bank?: string; last_amount?: string; last_at?: string };
export type IbanHolder = { iban_masked: string; holder: string };
export type LinkedAccount = { id: string; bank_name: string; label: string; iban_masked: string; authorized: boolean };
export type PullPending = { status: 'pending_authorization'; linked_account_id: string; message: string };

export type Problem = { code: string; title: string; status: number; request_id?: string };

// Pago de servicios
export type BillProvider = { id: string; category: string; name: string; reference_label: string };
export type BillQuote = {
  provider_id: string;
  provider_name: string;
  reference: string;
  holder: string;
  amount: string;
  period: string;
  due: string;
};
export type SavedBill = {
  id: string;
  provider_id: string;
  nickname: string;
  reference: string;
  autopay: boolean;
  autopay_cap: string | null;
  pending_amount: string | null;
  due_date: string | null;
  provider_name: string;
  category: string;
  reference_label: string;
};
export type BillPayment = { reference: string; receipt: string; amount: string; provider: string; points_earned: number };

// Préstamos
export type LoanOption = { label: string; term_months: number; monthly_payment: string; total_paid: string; recommended: boolean };
export type LoanSim = { annual_rate: string; monthly_payment: string; options: LoanOption[] };
export type LoanOffer = { preapproved: boolean; max_amount: string; annual_rate: string };
export type LoanApplication = { id: string; amount: string; term_months: number; status: string; created_at: string };
export type LoanDisbursement = { reference: string; amount: string; term_months: number; monthly_payment: string; first_due: string };

// Ahorro
export type Rate = { product: 'envelope' | 'term'; term_months: number | null; annual_rate: string };
export type TermDepositResult = { account_id: string; reference: string; annual_rate: string; maturity_date: string; estimated_interest: string };

export type RedeemDestination = 'account' | 'loan' | 'envelope' | 'cause';
export type Rewards = {
  points: number;
  value_crc: string;
  level: 'Bronce' | 'Plata' | 'Oro';
  points_lifetime: number;
  next_level_at: number | null;
  history: { points: number; reason: string; at: string }[];
  levels: { name: 'Bronce' | 'Plata' | 'Oro'; from_points: number; points_multiplier: string; rate_bonus: string; reached: boolean }[];
};
export type RedeemResult = { points_used: number; value: string; multiplier: string; destination: RedeemDestination };
export type FraudReason = 'unknown_charge' | 'lost_card' | 'stolen_phone' | 'suspicious_contact';
export type SupportCase = {
  number: string;
  kind: string;
  reason: FraudReason;
  status: string;
  cards_locked: number;
  created_at: string;
};

export type OtpStart = { challenge_id: string; expires_in: number; resend_in: number; debug_code: string | null };
export type Kyc = {
  occupation: 'asalariado' | 'negocio_propio' | 'pensionado' | 'estudiante';
  monthly_volume: 'lt_500k' | '500k_1500k' | 'gt_1500k';
  source_of_funds: 'salario' | 'ventas' | 'pension' | 'otro';
};
export type RegisterBody = {
  onboarding_token: string;
  cedula: string;
  full_name: string;
  email: string;
  province: string;
  canton: string;
  selfie_ok: boolean;
  kyc: Kyc;
  pin: string;
  accept_terms: true;
};
export type RegisterResult = { kyc_status: 'verified' | 'in_review' | 'rejected'; tokens: Tokens | null; message: string };
