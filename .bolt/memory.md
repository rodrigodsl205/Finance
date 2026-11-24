# Project memory

## Product intent & audience

- **DualCash**: personal/small-business finance app for tracking transactions, accounts, cards, and balances.
- Built with Vite + React; backend is Supabase (Postgres).
- UI is in Portuguese (pt-BR).

## Brand personality & voice

- Practical, clear, finance-oriented tone; concise labels (e.g. "Conta que recebeu o valor", "Conta de onde saiu o dinheiro").

## Visual design & UX direction

- Modal-based forms for transaction create/edit ("Novo Lançamento").
- Inline quick-create pattern: categories first, now payment methods — empty-state CTA + "+ Nova forma" button beside selector, inline input + "Adicionar" button, auto-select new item after creation.
- Conditional field rendering driven by transaction `type` and selected payment method:
  - Income → mandatory `account_id` (destination); no card/invoice fields.
  - Expense + credit-card payment method → `card_id` + invoice/installments; `account_id = null`.
  - Expense + non-credit payment method → mandatory `account_id` (source); `card_id = null`.
- Realtime updates expected on Accounts screen and Dashboard after paid transactions.

## Decisions, constraints & rationale

- Do not alter existing Supabase schema; implement logic in app layer.
- Payment methods filtered by `status = 'active'` and `kind` matching transaction `type` (income/expense).
- Switching transaction type clears `payment_method_id`, `account_id`, `card_id` to prevent inconsistency.
- Credit-card detection via payment-method name containing "crédito" (historically `startsWith('Cartão ')`); payment method `kind` field is the authoritative type filter.
- On save, only the pertinent reference is populated (`account_id` for account movements, `card_id` for credit).
- Inline payment-method creation sets `space_id` (active space), `name`, `kind`, `is_default: false`, `status: 'active'`; refreshes via `usePaymentMethods` hook.
- Account balance = `initial_balance_cents` + sum(paid income `amount_cents`) − sum(paid expense `amount_cents`) for matching `account_id`; transfers subtract from source `account_id` and add to `destination_account_id`.
- Data hooks expose `refresh()` (e.g. `refreshPaymentMethods`) for post-mutation reloads.

## Open questions & assumptions

- `PaymentMethod` type is assumed to include `status` and `kind`; verify/extend if missing.
- Transfer transactions (`type = 'transfer'`) exist in schema but are out of scope for the modal changes this turn.
- Invoice/installment fields and card entity shape not fully documented; current behavior preserved for credit-card expenses.