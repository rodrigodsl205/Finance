export type SpaceKind = 'personal' | 'shared';
export type SpaceRole = 'owner' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialSpace {
  id: string;
  name: string;
  kind: SpaceKind;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string;
  role: SpaceRole;
  joined_at: string;
  // Joined fields (from select with profiles)
  profiles?: Pick<Profile, 'display_name' | 'avatar_url'>;
}

export interface Invitation {
  id: string;
  space_id: string;
  invited_by: string;
  invitee_email: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
  // Joined fields
  financial_spaces?: Pick<FinancialSpace, 'name' | 'kind'>;
  inviter?: Pick<Profile, 'display_name'>;
}

// accounts
export type AccountType = 'checking' | 'digital' | 'savings' | 'cash' | 'other';
export type AccountStatus = 'active' | 'archived';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  digital: 'Conta digital',
  savings: 'Poupança',
  cash: 'Dinheiro',
  other: 'Outra',
};

export interface Account {
  id: string;
  space_id: string;
  name: string;
  type: AccountType;
  owner_id: string;
  holder_name: string | null;
  institution: string | null;
  agency: string | null;
  account_number: string | null;
  initial_balance_cents: number;
  reference_date: string;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export function accountDisplayLabel(account: Account): string {
  const institution = account.institution || account.name;
  const holder = account.holder_name;
  if (holder) return `${institution} - ${holder}`;
  return institution;
}

// categories
export type CategoryKind = 'expense' | 'income';
export type CategoryStatus = 'active' | 'archived';

export interface Category {
  id: string;
  space_id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  status: CategoryStatus;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

// transactions
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'pending' | 'paid' | 'partial' | 'cancelled';
export type SplitType = 'individual' | 'equal' | 'percent' | 'custom';

export interface Transaction {
  id: string;
  space_id: string;
  type: TransactionType;
  description: string;
  amount_cents: number;
  category_id: string | null;
  account_id: string | null;
  responsible_id: string | null;
  payer_id: string | null;
  destination_account_id: string | null;
  destination_member_id: string | null;
  establishment: string | null;
  cpf_cnpj: string | null;
  payment_method_id: string | null;
  card_id: string | null;
  invoice_item_id: string | null;
  occurred_at: string;
  due_date: string | null;
  paid_at: string | null;
  status: TransactionStatus;
  notes: string | null;
  split_type: SplitType;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  categories?: Pick<Category, 'name' | 'kind'>;
  accounts?: Pick<Account, 'name' | 'type'>;
  destination_accounts?: Pick<Account, 'name' | 'type'>;
  destination_members?: Pick<Profile, 'display_name'>;
  payment_methods?: Pick<PaymentMethod, 'name'>;
  cards?: Pick<Card, 'name' | 'brand'>;
  splits?: TransactionSplit[];
}

// payment_methods
export type PaymentMethodKind = 'expense' | 'income';
export type PaymentMethodStatus = 'active' | 'archived';

export interface PaymentMethod {
  id: string;
  space_id: string;
  name: string;
  icon: string | null;
  kind: PaymentMethodKind;
  is_default: boolean;
  status: PaymentMethodStatus;
  created_at: string;
  updated_at: string;
}

// cards
export type CardStatus = 'active' | 'archived';

export interface Card {
  id: string;
  space_id: string;
  name: string;
  holder_name: string | null;
  brand: string | null;
  last_digits: string | null;
  limit_cents: number;
  closing_day: number;
  due_day: number;
  owner_id: string;
  status: CardStatus;
  created_at: string;
  updated_at: string;
}

// invoices
export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'partial' | 'overdue';

export interface Invoice {
  id: string;
  card_id: string;
  space_id: string;
  period_start: string;
  period_end: string;
  closing_date: string;
  due_date: string;
  total_cents: number;
  paid_cents: number;
  status: InvoiceStatus;
  payment_method_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  cards?: Pick<Card, 'name' | 'brand'>;
  items?: InvoiceItem[];
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Em aberto',
  closed: 'Fechada',
  paid: 'Paga',
  partial: 'Parcial',
  overdue: 'Vencida',
};

// invoice_items
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  transaction_id: string | null;
  description: string;
  establishment: string | null;
  amount_cents: number;
  installment_number: number | null;
  installment_total: number | null;
  category_id: string | null;
  occurred_at: string;
  created_at: string;
  categories?: Pick<Category, 'name'>;
}

// transaction_splits
export interface TransactionSplit {
  id: string;
  transaction_id: string;
  member_id: string;
  share_cents: number;
  share_percent: number | null;
  created_at: string;
  // Joined
  profiles?: Pick<Profile, 'display_name'>;
}

// settlements
export type SettlementStatus = 'pending' | 'paid' | 'cancelled';

export interface Settlement {
  id: string;
  space_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  status: SettlementStatus;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  from_profile?: Pick<Profile, 'display_name'>;
  to_profile?: Pick<Profile, 'display_name'>;
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  partial: 'Parcial',
  cancelled: 'Cancelado',
};

// Date filters
export type DateCriterion =
  | 'occurred_at'
  | 'due_date'
  | 'paid_at'
  | 'invoice_due_date';

export const DATE_CRITERION_LABELS: Record<DateCriterion, string> = {
  occurred_at: 'Data de realização',
  due_date: 'Data de vencimento',
  paid_at: 'Data de pagamento',
  invoice_due_date: 'Vencimento da fatura',
};

// budgets
export interface Budget {
  id: string;
  space_id: string;
  category_id: string;
  period_month: string;
  limit_cents: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'name' | 'kind'>;
}

// goals
export type GoalStatus = 'active' | 'completed' | 'cancelled';

export interface Goal {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  target_cents: number;
  current_cents: number;
  target_date: string | null;
  status: GoalStatus;
  responsible_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contributions?: GoalContribution[];
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'Ativa',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

// goal_contributions
export interface GoalContribution {
  id: string;
  goal_id: string;
  amount_cents: number;
  contributed_by: string;
  contributed_at: string;
  notes: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'display_name'>;
}
